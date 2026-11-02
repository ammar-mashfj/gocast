<?php

use App\Models\User;
use App\Services\DisposableEmail;
use App\Services\MxLookup;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;

/*
| Throwaway addresses are refused where an address enters the system: by
| name (the maintained list plus ours) and by mail server (an MX host on
| disposable-mx-hosts.txt). DNS never leaves the test: Pest.php binds an
| MxLookup that answers "no MX" unless a test binds its own.
*/

/**
 * Answer MX lookups from a map; a domain mapped to null is a failed lookup.
 * Counts the lookups so a test can see the cache at work.
 *
 * @param  array<string, list<string>|null>  $map
 */
function fakeMx(array $map): object
{
    $lookup = new class($map) extends MxLookup
    {
        public int $calls = 0;

        /** @param  array<string, list<string>|null>  $map */
        public function __construct(private array $map) {}

        public function hosts(string $domain): ?array
        {
            $this->calls++;

            return array_key_exists($domain, $this->map) ? $this->map[$domain] : [];
        }
    };

    app()->instance(MxLookup::class, $lookup);

    return $lookup;
}

function signUp(string $email): TestResponse
{
    return test()->postJson('/api/auth/register', [
        'name' => 'Dana',
        'email' => $email,
        'password' => 'a-typed-password',
        'password_confirmation' => 'a-typed-password',
    ]);
}

describe('sign-up', function () {
    it('refuses a fldubai.com address', function () {
        signUp('qamj049z2l6@fldubai.com')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        expect(User::where('email', 'qamj049z2l6@fldubai.com')->exists())->toBeFalse();
    });

    it('refuses an unlisted domain whose mail goes to in.mail.tm', function () {
        fakeMx(['brand-new-tm.com' => ['in.mail.tm']]);

        expect(DisposableEmail::isListedDomain('brand-new-tm.com'))->toBeFalse();

        signUp('someone@brand-new-tm.com')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    });

    it('accepts a normal domain', function () {
        fakeMx(['permanent.example' => ['aspmx.l.google.com', 'alt1.aspmx.l.google.com']]);

        signUp('dana@permanent.example')->assertCreated();
    });

    it('accepts the address when the MX lookup fails', function () {
        fakeMx(['flaky-dns.example' => null]);

        signUp('dana@flaky-dns.example')->assertCreated();
    });
});

describe('the MX check', function () {
    it('matches a listed mail server and its subdomains, not lookalikes', function (array $hosts, bool $disposable) {
        fakeMx(['some-domain.example' => $hosts]);

        expect(app(DisposableEmail::class)->isDisposable('x@some-domain.example'))->toBe($disposable);
    })->with([
        'exact host' => [['mail.tm'], true],
        'subdomain' => [['in.mail.tm'], true],
        'one of several' => [['mx1.example.net', 'mail2.mailinator.com'], true],
        'lookalike' => [['in.notmail.tm'], false],
        'shared host' => [['route1.mx.cloudflare.net'], false],
        'no MX' => [[], false],
    ]);

    it('caches a domain’s answer so repeat sign-ups do not look it up again', function () {
        $lookup = fakeMx(['repeat.example' => ['in.mail.tm']]);
        $checker = app(DisposableEmail::class);

        expect($checker->isDisposable('a@repeat.example'))->toBeTrue()
            ->and($checker->isDisposable('b@repeat.example'))->toBeTrue()
            ->and($lookup->calls)->toBe(1);
    });

    it('does not cache a failed lookup', function () {
        $lookup = fakeMx(['flaky-dns.example' => null]);
        $checker = app(DisposableEmail::class);

        $checker->isDisposable('a@flaky-dns.example');
        $checker->isDisposable('b@flaky-dns.example');

        expect($lookup->calls)->toBe(2);
    });

    it('skips the lookup for a listed domain and for junk', function () {
        $lookup = fakeMx([]);
        $checker = app(DisposableEmail::class);

        $checker->isDisposable('a@mailinator.com');
        $checker->isDisposable('a@not a domain');

        expect($lookup->calls)->toBe(0);
    });
});

describe('MxLookup', function () {
    it('reads the hosts from a DNS-over-HTTPS answer', function () {
        Http::fake([MxLookup::ENDPOINT.'*' => Http::response(['Status' => 0, 'Answer' => [
            ['name' => 'fldubai.com', 'type' => 5, 'data' => 'alias.example.'],
            ['name' => 'fldubai.com', 'type' => 15, 'data' => '10 IN.mail.tm.'],
        ]])]);

        expect((new MxLookup)->hosts('fldubai.com'))->toBe(['in.mail.tm']);
    });

    it('treats a domain that does not exist as having no mail servers', function () {
        Http::fake([MxLookup::ENDPOINT.'*' => Http::response(['Status' => 3])]);

        expect((new MxLookup)->hosts('nope.example'))->toBe([]);
    });

    it('reports a timeout or a resolver error as unknown, with a warning', function (mixed $response) {
        Http::fake([MxLookup::ENDPOINT.'*' => $response]);
        Log::spy();

        expect((new MxLookup)->hosts('slow.example'))->toBeNull();

        Log::shouldHaveReceived('warning')->once();
    })->with([
        'timeout' => [fn () => fn () => throw new ConnectionException('timed out')],
        'SERVFAIL' => [fn () => Http::response(['Status' => 2])],
        'HTTP error' => [fn () => Http::response('', 503)],
    ]);
});
