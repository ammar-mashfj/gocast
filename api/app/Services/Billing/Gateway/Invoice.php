<?php

namespace App\Services\Billing\Gateway;

use Illuminate\Support\Carbon;

final readonly class Invoice
{
    public function __construct(
        public string $trackId,
        public string $paymentUrl,
        public ?Carbon $expiresAt,
    ) {}
}
