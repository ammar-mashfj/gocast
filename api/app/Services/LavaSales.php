<?php

namespace App\Services;

use App\Models\LavaSale;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\ProAccessGranted;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Turns a lava.top payment webhook into Pro time.
 *
 * Buyers pay through plain lava.top links, so nothing here started the
 * payment: the webhook is all we know. It names the product, the buyer's
 * email, the amount and currency, and the UTM tags of the link they came
 * from, but not which of the product's plans they picked.
 *
 * - Which account: the one with the buyer's email, else the id in
 *   `utm_content` (the dashboard puts it on its links).
 * - How long: the subscription is one calendar month a charge, first payment
 *   and every renewal alike, plus one day when it starts from today (see
 *   handle()). The pay-once product is told apart by the USD
 *   amount (config services.lava.pay_once); any other currency or amount is
 *   left to the admin, since exchange rates move.
 * - From when: PlanTerm::apply, the rule every grant shares, so time is added
 *   after a running Pro term and never overwrites a permanent or hand-made
 *   plan.
 *
 * The subscription is remembered on the account (users.lava_subscription_*)
 * so the Account page can cancel it through lava.top's API: Pro then runs to
 * the end of what was paid for. A cancel made on lava.top's side clears it
 * the same way, from the subscription.cancelled webhook.
 *
 * Failures and refunds are lava.top's to handle and are acknowledged without
 * doing anything.
 *
 * Whatever can't be granted is recorded with a reason and sent to the admin
 * on Telegram, never guessed. The unique contract id makes lava.top's
 * retries count once.
 */
class LavaSales
{
    public const EVENT_PAYMENT = 'payment.success';

    public const EVENT_RENEWAL = 'subscription.recurring.payment.success';

    public const EVENT_CANCELLED = 'subscription.cancelled';

    private const SUBSCRIPTION_MONTHS = 1;

    public function __construct(private readonly AdminTelegram $telegram) {}

    /**
     * @param  array<string, mixed>  $data  The webhook body.
     */
    public function handle(array $data): ?LavaSale
    {
        $event = (string) ($data['eventType'] ?? '');

        if ($event === self::EVENT_CANCELLED) {
            $this->forget($data);

            return null;
        }

        if (! in_array($event, [self::EVENT_PAYMENT, self::EVENT_RENEWAL], true)) {
            Log::info('lava.top webhook ignored', ['event' => $event]);

            return null;
        }

        $contractId = (string) ($data['contractId'] ?? '');

        if ($contractId === '') {
            Log::warning('lava.top payment webhook without a contract id', ['data' => $data]);

            return null;
        }

        $outcome = DB::transaction(function () use ($data, $event, $contractId) {
            $sale = LavaSale::createOrFirst(['contract_id' => $contractId], [
                'event_type' => $event,
                'product_id' => $data['product']['id'] ?? null,
                'email' => $data['buyer']['email'] ?? null,
                'amount' => is_numeric($data['amount'] ?? null) ? $data['amount'] : null,
                'currency' => $data['currency'] ?? null,
                'payload' => $data,
            ]);

            if (! $sale->wasRecentlyCreated) {
                return null;
            }

            if ($this->heldByDeletedAccount($data)) {
                return $this->flag($sale, 'A renewal of a subscription whose GoCast account was deleted. Cancel it on lava.top by hand and refund this charge.');
            }

            $user = $this->account($data);
            $another = false;

            if ($user !== null) {
                $sale->user_id = $user->id;

                // Before anything can be flagged: a subscriber whose charge
                // grants nothing (say they already have permanent Pro) still
                // needs Cancel on the Account page.
                if ($this->isProduct($sale, 'subscription_product_id')) {
                    $another = $this->remember($user, $sale, $event, $data);
                }
            }

            $months = $this->months($sale);

            if (is_string($months)) {
                return $this->flag($sale, $months);
            }

            $sale->months = $months;

            if ($user === null) {
                return $this->flag($sale, 'No GoCast account has the email '.($sale->email ?? '(none)').'. Find theirs and grant Pro by hand.');
            }

            $plan = Plan::where('slug', 'pro')->first();

            if ($plan === null) {
                return $this->flag($sale, 'There is no Pro plan to grant. Grant it by hand.');
            }

            $label = $months === 1 ? '1 month' : "{$months} months";
            $applied = PlanTerm::apply($user, $plan, ['label' => $label, 'weeks' => 0, 'months' => $months]);

            if (is_string($applied)) {
                return $this->flag($sale, "Paid, but not granted: {$applied} Grant or refund by hand.");
            }

            [$until, $extended] = $applied;

            if ($months === self::SUBSCRIPTION_MONTHS && $this->isProduct($sale, 'subscription_product_id') && ! $extended) {
                // A day of slack on a subscription that starts now, so the
                // next charge (due at about the same minute a month on) lands
                // before plans:expire can switch AutoDJ off. Renewals extend
                // from this end date, so the day carries over, never adds up.
                $until = $until->copy()->addDay();
                $user->forceFill(['plan_expires_at' => $until])->save();
            }

            $sale->granted_until = $until;
            $sale->save();

            return [$user, $plan, $label, $until, $extended, $another];
        });

        if ($outcome === null) {
            return null;
        }

        $sale = LavaSale::where('contract_id', $contractId)->first();

        // The sale is saved, so lava.top's retry would stop at it: a failure
        // to queue an email or alert must not turn into a 500 that asks for
        // one. It is reported instead.
        try {
            if ($outcome === 'flagged') {
                $this->alert(fn () => $this->telegram->lavaSaleNeedsReview($sale));

                return $sale;
            }

            /** @var array{0: User, 1: Plan, 2: string, 3: Carbon, 4: bool, 5: bool} $outcome */
            [$user, $plan, $label, $until, $extended, $another] = $outcome;

            // A renewal is the same month every month: the receipt is lava.top's,
            // and an email from us each time would only be noise.
            if ($event === self::EVENT_PAYMENT) {
                $user->notify(new ProAccessGranted($plan, $until, $label, paid: true, extended: $extended));
            }

            $this->alert(fn () => $this->telegram->lavaSaleGranted($sale, $user));

            if ($another) {
                $this->alert(fn () => $this->telegram->lavaSecondSubscription($sale, $user));
            }
        } catch (Throwable $e) {
            report($e);
        }

        return $sale;
    }

    /**
     * Stop the account's subscription at lava.top. Its Pro is left alone: it
     * runs to the end of what was paid for, and plans:expire ends it.
     *
     * @return string|null Why it couldn't be cancelled, or null when it was.
     */
    public function cancel(User $user, string $where = 'on the Account page'): ?string
    {
        $contractId = $user->lava_subscription_contract_id;

        if ($contractId === null) {
            return 'There is no monthly subscription on this account.';
        }

        $key = (string) config('services.lava.api_key');

        if ($key === '') {
            return 'Cancelling isn\'t available right now. Email hello@gocast.fm and we\'ll cancel it for you.';
        }

        try {
            $response = Http::withHeaders(['X-Api-Key' => $key])
                ->acceptJson()
                ->timeout(15)
                ->delete(rtrim((string) config('services.lava.base_url'), '/').'/api/v1/subscriptions?'.http_build_query([
                    'contractId' => $contractId,
                    'email' => $user->lava_subscription_email ?? $user->email,
                ]));
        } catch (ConnectionException $e) {
            Log::warning('lava.top cancel unreachable', ['user' => $user->id, 'error' => $e->getMessage()]);

            return 'We couldn\'t reach the payment provider. Try again in a minute.';
        }

        if (! $response->successful()) {
            Log::warning('lava.top cancel refused', ['user' => $user->id, 'status' => $response->status(), 'body' => mb_substr($response->body(), 0, 500)]);

            return 'The payment provider didn\'t cancel it. Try again in a minute, or email hello@gocast.fm and we\'ll do it for you.';
        }

        $user->forceFill(['lava_subscription_contract_id' => null, 'lava_subscription_email' => null])->save();
        $this->alert(fn () => $this->telegram->lavaSubscriptionCancelled($user, $where));

        return null;
    }

    /**
     * The account is being deleted: stop its subscription so a closed
     * account isn't charged again. Never blocks the deletion. If lava.top
     * won't cancel, the admin gets what they need to do it by hand.
     */
    public function cancelForDeletedAccount(User $user): void
    {
        if ($user->lava_subscription_contract_id === null) {
            return;
        }

        $contractId = $user->lava_subscription_contract_id;
        $email = $user->lava_subscription_email ?? $user->email;
        $refusal = $this->cancel($user, 'account deleted');

        if ($refusal !== null) {
            $this->alert(fn () => $this->telegram->lavaCancelFailed($user->email, $contractId, $email, $refusal));
        }
    }

    /**
     * Cancelled on lava.top's side (or by lava.top after failed charges):
     * forget the subscription so the Account page stops offering to cancel
     * it. The account's Pro is left to run out.
     *
     * @param  array<string, mixed>  $data
     */
    private function forget(array $data): void
    {
        // By contract only: an email match could clear a different
        // subscription the same buyer still pays for.
        $contracts = array_filter([(string) ($data['contractId'] ?? ''), (string) ($data['parentContractId'] ?? '')]);

        $user = $contracts === [] ? null : User::withTrashed()->whereIn('lava_subscription_contract_id', $contracts)->first();

        if ($user === null) {
            return;
        }

        $user->forceFill(['lava_subscription_contract_id' => null, 'lava_subscription_email' => null])->save();
        $this->alert(fn () => $this->telegram->lavaSubscriptionCancelled($user, 'on lava.top'));
    }

    /**
     * Keep the subscription on the account, for the cancel call: the first
     * charge's contract and the email it was bought with (a renewal names
     * its first charge as parentContractId).
     *
     * @param  array<string, mixed>  $data
     * @return bool Whether the account already holds a different one: a second
     *              subscription, which the admin has to cancel by hand.
     */
    private function remember(User $user, LavaSale $sale, string $event, array $data): bool
    {
        $first = $event === self::EVENT_RENEWAL ? (string) ($data['parentContractId'] ?? '') : $sale->contract_id;

        if ($first === '') {
            return false;
        }

        if ($user->lava_subscription_contract_id === null) {
            $user->forceFill(['lava_subscription_contract_id' => $first, 'lava_subscription_email' => $sale->email])->save();

            return false;
        }

        return $user->lava_subscription_contract_id !== $first;
    }

    /**
     * A renewal of a subscription held by a deleted account. Its cancel
     * failed at deletion (the admin was told), and it must not fall through
     * to whoever has since signed up with the buyer's email.
     *
     * @param  array<string, mixed>  $data
     */
    private function heldByDeletedAccount(array $data): bool
    {
        $parent = (string) ($data['parentContractId'] ?? '');

        return $parent !== '' && User::onlyTrashed()->where('lava_subscription_contract_id', $parent)->exists();
    }

    /**
     * For a renewal, the account holding its subscription; otherwise the
     * account with the buyer's email (the dialog asks them to pay with it),
     * else the one the dashboard link named. The email goes first because a
     * link can be forwarded: a friend paying with their own GoCast email
     * gets the Pro, not whoever shared the link. Locked: PlanTerm::apply
     * writes its plan dates.
     *
     * @param  array<string, mixed>  $data
     */
    private function account(array $data): ?User
    {
        // A renewal belongs to whoever holds its subscription, whatever email
        // either side has now (GoCast emails can be changed).
        $parent = (string) ($data['parentContractId'] ?? '');

        if ($parent !== '' && ($user = User::where('lava_subscription_contract_id', $parent)->lockForUpdate()->first()) !== null) {
            return $user;
        }

        $email = trim((string) ($data['buyer']['email'] ?? ''));

        if ($email !== '' && ($user = User::where('email', $email)->lockForUpdate()->first()) !== null) {
            return $user;
        }

        $id = (string) ($data['clientUtm']['utm_content'] ?? '');

        return ctype_digit($id) ? User::whereKey((int) $id)->lockForUpdate()->first() : null;
    }

    /**
     * How many months this charge buys, or why that can't be told.
     */
    private function months(LavaSale $sale): int|string
    {
        $paid = trim(($sale->amount ?? '?').' '.($sale->currency ?? ''));

        if ($this->isProduct($sale, 'subscription_product_id')) {
            return self::SUBSCRIPTION_MONTHS;
        }

        if (! $this->isProduct($sale, 'pay_once_product_id')) {
            return "Paid {$paid} for a lava.top product we don't sell through the dashboard. Grant it by hand.";
        }

        $months = $sale->currency === 'USD' && $sale->amount !== null
            ? (config('services.lava.pay_once')[$sale->amount] ?? null)
            : null;

        return $months ?? "Paid {$paid} for the pay-once product, which matches none of its USD prices. Work out the plan and grant it by hand.";
    }

    private function isProduct(LavaSale $sale, string $key): bool
    {
        return $sale->product_id !== null && strcasecmp($sale->product_id, (string) config("services.lava.{$key}")) === 0;
    }

    /**
     * Send an admin alert without letting a queue failure undo what was
     * already done (a cancel at lava.top, a deletion, a saved sale).
     *
     * @param  callable(): void  $send
     */
    private function alert(callable $send): void
    {
        try {
            $send();
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function flag(LavaSale $sale, string $reason): string
    {
        $sale->review_reason = mb_substr($reason, 0, 500);
        $sale->save();

        return 'flagged';
    }
}
