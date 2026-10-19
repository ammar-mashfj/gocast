<?php

namespace App\Services\Billing;

use RuntimeException;

/** Checkout said no. The message is shown to the buyer as it is. */
class CheckoutRefused extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }
}
