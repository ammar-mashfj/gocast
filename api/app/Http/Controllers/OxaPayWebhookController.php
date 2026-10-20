<?php

namespace App\Http\Controllers;

use App\Services\Billing\OxaPaySignature;
use App\Services\Billing\PaymentProcessor;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Where OxaPay reports invoice status changes ("paying", then "paid").
 *
 * Signed with the merchant key (OxaPaySignature). Processed inline rather
 * than queued: the work is two row locks and a column write, the grant
 * should land before the buyer's return page next polls, and OxaPay retries
 * anything that is not `200 ok` — so a failure here is retried by them.
 *
 * Acknowledges with the literal body `ok`, which is what OxaPay checks for.
 */
class OxaPayWebhookController extends Controller
{
    public function __invoke(Request $request, PaymentProcessor $processor): Response
    {
        $key = (string) config('services.oxapay.merchant_key');

        // Unconfigured: refuse rather than accept unsigned payloads. OxaPay
        // retries, so nothing is lost while the key is being set.
        if ($key === '') {
            return response('not configured', 503);
        }

        if (! OxaPaySignature::verify($request->getContent(), $request->header('HMAC'), $key)) {
            return response('invalid signature', 401);
        }

        $data = json_decode($request->getContent(), true);

        if (! is_array($data)) {
            return response('invalid body', 400);
        }

        $processor->process($data, 'webhook');

        return response('ok', 200)->header('Content-Type', 'text/plain');
    }
}
