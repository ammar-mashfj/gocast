<?php

namespace App\Services\Billing\Gateway;

use RuntimeException;
use Throwable;

/**
 * The provider refused or could not be reached. The message is for logs and
 * admins, not buyers; `buyerMessage` is set when the refusal is something the
 * buyer can fix (a coupon the provider won't take).
 */
class GatewayException extends RuntimeException
{
    public function __construct(string $message, public readonly ?string $buyerMessage = null, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
