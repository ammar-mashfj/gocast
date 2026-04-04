<?php

namespace App\Models;

use Database\Factories\StationFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Station extends Model
{
    /** @use HasFactory<StationFactory> */
    use HasFactory, HasUuids;

    protected $guarded = [];

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
            'social_links' => 'array',
            'theme_config' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function streamSessions(): HasMany
    {
        return $this->hasMany(StreamSession::class);
    }
}
