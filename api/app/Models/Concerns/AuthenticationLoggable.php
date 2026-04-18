<?php

namespace App\Models\Concerns;

use App\Models\AuthenticationLog;
use Illuminate\Database\Eloquent\Relations\MorphMany;

trait AuthenticationLoggable
{
    public function authentications(): MorphMany
    {
        return $this->morphMany(AuthenticationLog::class, 'authenticatable');
    }
}
