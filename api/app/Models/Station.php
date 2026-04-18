<?php

namespace App\Models;

use Database\Factories\StationFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Represents a radio station owned by a user.
 *
 * Uses UUIDs as primary keys and slugs for route model binding.
 *
 * @property string $id
 * @property string $user_id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $genre
 * @property string|null $artwork_url
 * @property bool $is_live
 * @property string $icecast_mount
 * @property string $icecast_password
 * @property array|null $social_links
 * @property array|null $theme_config
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Station extends Model
{
    /** @use HasFactory<StationFactory> */
    use HasFactory, HasUuids;

    protected $guarded = [];

    /**
     * Auto-generate icecast_mount from the slug and a random password on creation.
     * On update, keep the mount path in sync when the slug changes.
     */
    protected static function booted(): void
    {
        static::creating(function (Station $station) {
            $station->icecast_mount ??= '/stream/'.$station->slug;
            $station->icecast_password ??= Str::random(32);
        });

        static::updating(function (Station $station) {
            if ($station->isDirty('slug')) {
                $station->icecast_mount = '/stream/'.$station->slug;
            }
        });
    }

    protected function casts(): array
    {
        return [
            'is_live' => 'boolean',
            'featured' => 'boolean',
            'social_links' => 'array',
            'theme_config' => 'array',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function streamSessions(): HasMany
    {
        return $this->hasMany(StreamSession::class);
    }

    /**
     * Compute broadcast stats with a single aggregate query instead of
     * loading all session rows into memory.
     *
     * @return array{sessions: int, total_airtime_seconds: int, peak_listeners: int}
     */
    public function computeStats(): array
    {
        $stats = $this->streamSessions()
            ->whereNotNull('ended_at')
            ->selectRaw('COUNT(*) as sessions')
            ->selectRaw('COALESCE(SUM(TIMESTAMPDIFF(SECOND, started_at, ended_at)), 0) as total_airtime_seconds')
            ->selectRaw('COALESCE(MAX(peak_listeners), 0) as peak_listeners')
            ->first();

        return [
            'sessions' => (int) $stats->sessions,
            'total_airtime_seconds' => (int) $stats->total_airtime_seconds,
            'peak_listeners' => (int) $stats->peak_listeners,
        ];
    }

    public function tracks(): HasMany
    {
        return $this->hasMany(Track::class)->orderBy('sort_order');
    }
}
