<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AuthenticationLog extends Model
{
    protected $table = 'authentication_log';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'login_at' => 'datetime',
            'logout_at' => 'datetime',
            'login_successful' => 'bool',
            'cleared_by_user' => 'bool',
        ];
    }

    public function authenticatable(): MorphTo
    {
        return $this->morphTo();
    }
}
