<?php

namespace App\Services\Lava;

/** What lava.top answered when a payment was created. */
final readonly class LavaInvoice
{
    public function __construct(
        public string $contractId,
        public string $paymentUrl,
    ) {}
}
