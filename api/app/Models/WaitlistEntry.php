<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $email
 * @property string $plan
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class WaitlistEntry extends Model
{
    protected $fillable = [
        'email',
        'plan',
    ];
}
