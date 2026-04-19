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
     * Generate a unique slug from the station name on creation, then derive
     * the Icecast mount and a random source password. Slug is immutable
     * after creation — there is no update hook to regenerate it.
     */
    protected static function booted(): void
    {
        static::creating(function (Station $station) {
            if (empty($station->slug)) {
                $station->slug = static::generateUniqueSlug($station->name);
            }
            $station->icecast_mount ??= '/stream/'.$station->slug;
            $station->icecast_password ??= Str::random(32);
        });
    }

    /**
     * Slugify the given name and append -2, -3, ... until the slug is free.
     *
     * Names that produce an empty slug (e.g. emoji-only) fall back to "station".
     */
    protected static function generateUniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        if ($base === '') {
            $base = 'station';
        }
        $base = Str::limit($base, 55, '');

        $slug = $base;
        $suffix = 2;
        while (static::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return $slug;
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
