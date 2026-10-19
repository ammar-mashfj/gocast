<?php

namespace App\Services\Billing\Grants;

use Illuminate\Support\Carbon;

final readonly class GrantResult
{
    /**
     * @param  Carbon|null  $until  When what was granted ends, if it does.
     * @param  bool  $extended  Added to a grant that was still running.
     */
    public function __construct(
        public ?Carbon $until,
        public bool $extended = false,
    ) {}
}
