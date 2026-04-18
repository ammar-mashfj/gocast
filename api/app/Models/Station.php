<?php

namespace App\Models;

use Database\Factories\StationFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

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
    use HasFactory, HasUuids, LogsActivity, SoftDeletes;

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

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'slug', 'description', 'genre', 'featured', 'is_live'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
