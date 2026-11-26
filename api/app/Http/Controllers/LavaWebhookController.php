<?php

namespace App\Http\Controllers;

use App\Services\Lava\LavaException;
use App\Services\Lava\LavaWebhook;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Where lava.top reports payments, renewals, cancellations, refunds and
 * chargebacks.
 *
 * lava.top doesn't sign its webhooks; it sends the password set on the
 * webhook in its dashboard, as Basic auth or an X-Api-Key header, whichever
 * was chosen there. Both are accepted, compared in constant time.
 *
 * Processed inline, like OxaPay's: anything but 2xx is retried by lava.top
 * (19 times over about five hours), so a 503 when lava.top's API can't
 * confirm a charge is the retry, not a loss.
 */
class LavaWebhookController extends Controller
{
    public function __invoke(Request $request, LavaWebhook $webhook): Response
    {
        $secret = (string) config('services.lava.webhook_secret');

        if ($secret === '') {
            return response('not configured', 503);
        }

        $given = (string) ($request->header('X-Api-Key') ?? $request->getPassword() ?? '');

        if (! hash_equals($secret, $given)) {
            return response('unauthorized', 401);
        }

        $data = json_decode($request->getContent(), true);

        if (! is_array($data)) {
            return response('invalid body', 400);
        }

        try {
            $webhook->handle($data);
        } catch (LavaException $e) {
            report($e);

            return response('try again', 503);
        }

        return response('ok', 200)->header('Content-Type', 'text/plain');
    }
}
