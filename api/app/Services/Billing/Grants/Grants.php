<?php

namespace App\Services\Billing\Grants;

use App\Models\Product;
use InvalidArgumentException;

final class Grants
{
    public static function for(string $grantType): PurchaseGrant
    {
        return match ($grantType) {
            Product::GRANT_PLAN_TERM => app(PlanTermGrant::class),
            default => throw new InvalidArgumentException("No grant is defined for \"{$grantType}\"."),
        };
    }
}
