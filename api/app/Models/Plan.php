<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

/**
 * @property int $id
 * @property string $slug
 * @property string $name
 * @property int $max_stations
 * @property int $max_listeners
 */
class Plan extends Model
{
    use HasFactory;
    use LogsActivity;

    protected $guarded = [];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'slug', 'max_stations', 'max_listeners'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
