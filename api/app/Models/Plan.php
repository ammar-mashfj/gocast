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
 * @property int $max_running_stations
 * @property int $max_listeners
 * @property bool $autodj_enabled
 * @property int $analytics_days
 * @property bool $embed_enabled
 * @property bool $watermark_enabled
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

    /**
     * The plan every account starts on and is moved back to. Matched by slug,
     * the same way AccessRequestController and plans:expire find it.
     */
    public function isFree(): bool
    {
        return $this->slug === 'free';
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'autodj_enabled' => 'boolean',
            'analytics_days' => 'integer',
            'embed_enabled' => 'boolean',
            'watermark_enabled' => 'boolean',
        ];
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'slug', 'max_stations', 'max_running_stations', 'max_listeners', 'autodj_enabled', 'analytics_days', 'embed_enabled', 'watermark_enabled'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
