<?php

namespace App\Http\Controllers;

use App\Services\LavaSales;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Where lava.top reports payments made through the dashboard's links.
 *
 * lava.top doesn't sign its webhooks: it sends a secret we chose, either as
 * an X-Api-Key header or as the Basic-auth password, depending on how the
 * webhook is set up in its panel. Both are accepted.
 *
 * Processed inline: a grant is two row locks and a write. Anything but a 2xx
 * is retried by lava.top for hours, and LavaSales rolls back on a failure,
 * so a retry starts clean.
 */
class LavaWebhookController extends Controller
{
    public function __invoke(Request $request, LavaSales $sales): Response
    {
        $secret = (string) config('services.lava.webhook_secret');

        // Unconfigured: refuse rather than accept anyone's payload. lava.top
        // retries, so nothing is lost while the secret is being set.
        if ($secret === '') {
            return response('not configured', 503);
        }

        $given = (string) ($request->header('X-Api-Key') ?: $request->getPassword());

        if (! hash_equals($secret, $given)) {
            return response('unauthorized', 401);
        }

        $data = json_decode($request->getContent(), true);

        if (! is_array($data)) {
            return response('invalid body', 400);
        }

        $sales->handle($data);

        return response('ok', 200)->header('Content-Type', 'text/plain');
    }
}
