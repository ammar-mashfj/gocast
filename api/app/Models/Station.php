<?php

namespace App\Models;

use Database\Factories\StationFactory;
use Illuminate\Database\Eloquent\Builder;
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
 * @property string $desired_state
 * @property Carbon|null $started_at
 * @property Carbon|null $silent_since
 * @property Carbon|null $last_ready_at
 * @property string $icecast_mount
 * @property string $icecast_password
 * @property bool $jingles_enabled
 * @property string $jingle_mode one of JINGLE_MODE_INTERVAL | JINGLE_MODE_TRACKS
 * @property int $jingle_interval_seconds
 * @property int $jingle_every_tracks
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
     * Owner intent: no Liquidsoap container should exist for this station.
     * The default for new stations — creating a station no longer puts it
     * on air, so the owner can build a playlist and set artwork first.
     */
    public const STATE_STOPPED = 'stopped';

    /**
     * Owner intent: a Liquidsoap container should be running, whether or
     * not anyone is broadcasting into it. This is what the reconciler
     * converges the Docker daemon against.
     */
    public const STATE_RUNNING = 'running';

    /**
     * Minimum gap between two jingles for a station that has never set one —
     * the "station ID twice an hour" convention. Mirrors the column default;
     * kept here too because the model is rendered into the .liq before it is
     * ever read back from the database.
     */
    public const DEFAULT_JINGLE_INTERVAL_SECONDS = 1800;

    public const DEFAULT_JINGLE_EVERY_TRACKS = 5;

    /**
     * Space jingles by wall-clock time. Predictable for legal IDs and sponsor
     * reads, and unaffected by how long the station's tracks are.
     */
    public const JINGLE_MODE_INTERVAL = 'interval';

    /**
     * Space jingles by how many rotation tracks have played. Even musical
     * density; real-world spacing swings with track length.
     */
    public const JINGLE_MODE_TRACKS = 'tracks';

    /** @var list<string> */
    public const JINGLE_MODES = [self::JINGLE_MODE_INTERVAL, self::JINGLE_MODE_TRACKS];

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
            // Set here as well as in the column default so the in-memory
            // model is never a null state: isRunning() and the API resource
            // both read this immediately after create(), before any refresh.
            $station->desired_state ??= self::STATE_STOPPED;

            // Same reasoning. LiquidsoapSupervisor renders the .liq straight
            // off the in-memory model, so a null interval here would reach
            // delay() as 0 — a jingle between every single track.
            $station->jingles_enabled ??= false;
            $station->jingle_mode ??= self::JINGLE_MODE_INTERVAL;
            $station->jingle_interval_seconds ??= self::DEFAULT_JINGLE_INTERVAL_SECONDS;
            $station->jingle_every_tracks ??= self::DEFAULT_JINGLE_EVERY_TRACKS;
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
            'featured' => 'boolean',
            'jingles_enabled' => 'boolean',
            'jingle_interval_seconds' => 'integer',
            'jingle_every_tracks' => 'integer',
            'social_links' => 'array',
            'theme_config' => 'array',
            'started_at' => 'datetime',
            'silent_since' => 'datetime',
            'last_ready_at' => 'datetime',
        ];
    }

    /**
     * Stations whose owner has asked for a running container. The reconciler
     * and the relaunch command both work off this set — never off every row.
     *
     * @param  Builder<Station>  $query
     */
    public function scopeRunning($query): void
    {
        $query->where('desired_state', self::STATE_RUNNING);
    }

    /**
     * Has the owner asked for this station to be on air? This is intent, not
     * observation — use LiquidsoapSupervisor::isRunning() to ask the daemon
     * what is actually up, and StationStatusService to ask the container
     * whether audio is really flowing.
     */
    public function isRunning(): bool
    {
        return $this->desired_state === self::STATE_RUNNING;
    }

    /**
     * Stations with a human broadcaster publishing right now.
     *
     * There is no `is_live` column to read: live-ness is derived from the open
     * StreamSession that harbor's `live_connected` event opens and
     * `live_disconnected` closes. Same signal that used to write the column,
     * but against a record we already keep for billing rather than a second
     * copy that could drift from it.
     *
     * Use this for fan-out (lists, admin widgets, metrics) where asking each
     * container over HTTP would mean one socket per row. For a single station,
     * StationStatusService reads the authority directly.
     *
     * @param  Builder<Station>  $query
     */
    public function scopeLive($query): void
    {
        $query->whereHas('streamSessions', fn ($session) => $session->whereNull('ended_at'));
    }

    /**
     * Is a broadcaster publishing right now? Derived, never stored — see
     * scopeLive(). Costs a query unless `streamSessions` is already loaded,
     * so prefer the scope when handling more than one station.
     */
    public function isLive(): bool
    {
        if ($this->relationLoaded('streamSessions')) {
            return $this->streamSessions->whereNull('ended_at')->isNotEmpty();
        }

        return $this->streamSessions()->whereNull('ended_at')->exists();
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
     * Every uploaded audio file for this station — rotation AND jingles.
     * Ordered by manual position (drag-to-reorder UI); the `position` column
     * is gap-free per station AND kind, so this ordering is only meaningful
     * once the query is narrowed to one kind.
     *
     * Prefer musicTracks()/jingles() unless you genuinely want both (the
     * storage quota is the one place that does — jingles count against the
     * same per-station cap).
     */
    public function tracks(): HasMany
    {
        return $this->hasMany(Track::class)->orderBy('position');
    }

    /**
     * The AutoDJ rotation, in the order AutoDjScheduler walks it to answer
     * the container's "what do I play next?".
     */
    public function musicTracks(): HasMany
    {
        return $this->tracks()->where('kind', Track::KIND_MUSIC);
    }

    /**
     * Station IDs / liners. Written to `jingles.m3u`, which Liquidsoap reads
     * in randomize mode — so the ordering carried here is cosmetic, it only
     * gives the UI a stable list.
     */
    public function jingles(): HasMany
    {
        return $this->tracks()->where('kind', Track::KIND_JINGLE);
    }

    public function notifySubscriptions(): HasMany
    {
        return $this->hasMany(StationNotifySubscription::class);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'slug', 'description', 'genre', 'featured', 'desired_state'])
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
