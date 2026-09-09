<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * One thing that happened to one station, in the order it happened.
 *
 * This is the station's TIMELINE — the answer to "what was this station doing
 * at 3am?" — and it is deliberately a different table from the three logs that
 * already existed, each of which answers something narrower:
 *
 *   • `activity_log` (spatie) is the AUDIT TRAIL: who changed a station's
 *     name, slug or featured flag. Causer-attributed, low volume, keyed on
 *     stringly-typed subject columns. Container events have no causer and
 *     arrive thousands at a time, so putting them there would bury the audit
 *     trail in machine noise and make every per-station query a scan.
 *   • `stream_sessions` is AIRTIME: one row per live broadcast window. It says
 *     a broadcaster was connected from X to Y, never why they left.
 *   • `listener_sessions` is the AUDIENCE, at the far end of the pipe.
 *
 * Nothing here is load-bearing. Every write goes through {@see self::record()},
 * which swallows its own failures: this table observes the system and must
 * never be able to break it. A missing row costs a gap in a timeline, and that
 * is the whole cost.
 *
 * Rows are PRUNED (`stations:prune-events`). A station stuck in an Icecast
 * reconnect loop writes an event every few seconds, so this table must have a
 * ceiling or it becomes the largest one in the database.
 */
class StationEvent extends Model
{
    use HasFactory;

    /**
     * An event happened once and is never revised.
     *
     * `created_at` is still written automatically; only the update timestamp
     * is switched off.
     */
    public const UPDATED_AT = null;

    /*
    |--------------------------------------------------------------------------
    | Sources
    |--------------------------------------------------------------------------
    */

    /** Reported by the station's own Liquidsoap container. */
    public const SOURCE_CONTAINER = 'container';

    /** The owner did this, through the dashboard or the studio. */
    public const SOURCE_OWNER = 'owner';

    /** An admin did this, through the admin panel. */
    public const SOURCE_ADMIN = 'admin';

    /** A scheduled command or queued job did this — nobody was watching. */
    public const SOURCE_SYSTEM = 'system';

    /*
    |--------------------------------------------------------------------------
    | Types
    |--------------------------------------------------------------------------
    |
    | The container's nine are the exact strings StationEventController already
    | accepts, unchanged: that endpoint is the container's vocabulary and this
    | table records it verbatim rather than translating it into a second set of
    | names that could drift.
    |
    | Note what is NOT here: there is no `autodj_started` event, because there
    | is no such moment to observe. AutoDJ is Liquidsoap's fallback, so a
    | station switches to it the instant `live_disconnected` fires and away
    | from it on `live_connected`. Pairing those two is what makes AutoDJ
    | airtime derivable — it is the one number the station page could never
    | honestly show before this table existed.
    */

    /** Container: the Liquidsoap process came up. */
    public const TYPE_BOOT = 'boot';

    /** Container: the Liquidsoap process is going down. */
    public const TYPE_SHUTDOWN = 'shutdown';

    /** Container: Icecast accepted the source — listeners can hear this now. */
    public const TYPE_ICECAST_CONNECTED = 'icecast_connected';

    /** Container: the Icecast source connection dropped. */
    public const TYPE_ICECAST_DISCONNECTED = 'icecast_disconnected';

    /** Container: Icecast refused or errored. */
    public const TYPE_ICECAST_ERROR = 'icecast_error';

    /** Container: the live input went quiet. */
    public const TYPE_LIVE_SILENT = 'live_silent';

    /** Container: audio returned on the live input. */
    public const TYPE_LIVE_AUDIO = 'live_audio';

    /** Container: a broadcaster connected to harbor — AutoDJ steps aside. */
    public const TYPE_LIVE_CONNECTED = 'live_connected';

    /** Container: the broadcaster dropped — AutoDJ takes over. */
    public const TYPE_LIVE_DISCONNECTED = 'live_disconnected';

    /** Intent: the station was switched on. */
    public const TYPE_STARTED = 'started';

    /** Intent: the station was switched off. */
    public const TYPE_STOPPED = 'stopped';

    /** Library: a track or jingle was added. */
    public const TYPE_TRACK_UPLOADED = 'track_uploaded';

    /** Library: a track or jingle was removed. */
    public const TYPE_TRACK_DELETED = 'track_deleted';

    /**
     * Types a station's container is allowed to report.
     *
     * StationEventController holds the same list for its own validation. This
     * copy exists so the admin filter can offer them without importing an HTTP
     * controller into a view.
     *
     * @var list<string>
     */
    public const CONTAINER_TYPES = [
        self::TYPE_BOOT,
        self::TYPE_SHUTDOWN,
        self::TYPE_ICECAST_CONNECTED,
        self::TYPE_ICECAST_DISCONNECTED,
        self::TYPE_ICECAST_ERROR,
        self::TYPE_LIVE_SILENT,
        self::TYPE_LIVE_AUDIO,
        self::TYPE_LIVE_CONNECTED,
        self::TYPE_LIVE_DISCONNECTED,
    ];

    /**
     * Every type, in the order a timeline filter should offer them: the
     * lifecycle bookends first, then the container's own vocabulary, then the
     * library. Not alphabetical — somebody scanning this list is looking for
     * "why did it stop", and that should not be filed under S.
     *
     * @var list<string>
     */
    public const TYPES = [
        self::TYPE_STARTED,
        self::TYPE_STOPPED,
        ...self::CONTAINER_TYPES,
        self::TYPE_TRACK_UPLOADED,
        self::TYPE_TRACK_DELETED,
    ];

    /** @var list<string> */
    public const SOURCES = [
        self::SOURCE_CONTAINER,
        self::SOURCE_OWNER,
        self::SOURCE_ADMIN,
        self::SOURCE_SYSTEM,
    ];

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'properties' => 'array',
        ];
    }

    /**
     * Append one event to a station's timeline.
     *
     * NEVER THROWS. Callers are the upload pipeline, the power button and the
     * container webhook — none of which may fail because an observability
     * write failed. A dead database here produces a log line and a gap, not a
     * failed upload.
     *
     * @param  Station|string  $station  The station, or just its id: the
     *                                   container webhook has the model, the
     *                                   track deleter often only has the key.
     * @param  array<string, mixed>  $properties
     * @param  Model|null  $causer  Explicit actor. Omit to resolve whoever is
     *                              authenticated, which is right for a request
     *                              and correctly yields null in a queued job.
     */
    public static function record(
        Station|string $station,
        string $type,
        ?string $source = null,
        array $properties = [],
        ?Model $causer = null,
    ): ?self {
        try {
            $causer ??= self::resolveCauser();
            $source ??= self::sourceFor($causer);
            $stationId = $station instanceof Station ? $station->getKey() : $station;

            if (! self::withinRateCap($stationId, $source)) {
                return null;
            }

            return self::create([
                'station_id' => $stationId,
                'type' => $type,
                'source' => $source,
                'causer_type' => $causer?->getMorphClass(),
                'causer_id' => $causer?->getKey(),
                'properties' => $properties === [] ? null : $properties,
            ]);
        } catch (Throwable $e) {
            Log::warning('Could not record station event', [
                'station' => $station instanceof Station ? $station->slug : $station,
                'type' => $type,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Is this station still under its per-minute write budget?
     *
     * Applies to CONTAINER EVENTS ONLY. Those are the ones that arrive
     * unattended and in floods — a container stuck in a restart loop reports
     * a boot and a shutdown every couple of seconds, all night. Everything
     * else is a person pressing a button or uploading a file, is rare by
     * construction, and is the most valuable thing in the timeline: dropping
     * an owner's `stopped` event because their container was noisy in the same
     * minute would lose exactly the row somebody came here to find.
     *
     * The counter is a cache key, so it is approximate and resets with the
     * cache. That is the right precision for a backstop whose job is to bound
     * disk growth, not to be exact.
     */
    private static function withinRateCap(string $stationId, string $source): bool
    {
        $cap = (int) config('station_events.max_per_minute', 60);

        if ($cap <= 0 || $source !== self::SOURCE_CONTAINER) {
            return true;
        }

        $key = 'station-event-rate:'.$stationId.':'.now()->format('YmdHi');

        // add() then increment(): add() seeds the key with its TTL, and
        // increment() on an existing key leaves that TTL alone. Doing it the
        // other way round produces a key that never expires.
        Cache::add($key, 0, 120);

        return (int) Cache::increment($key) <= $cap;
    }

    /**
     * Whoever is driving this request, if anybody is.
     *
     * The admin guard is checked first: an admin acting on a station is also
     * signed in as nothing else, but the ordering makes the intent explicit
     * and survives someone later adding an impersonation path.
     */
    private static function resolveCauser(): ?Model
    {
        foreach (['admin', 'sanctum', 'web'] as $guard) {
            // Sanctum registers its guard at boot rather than in config/auth.php,
            // and a guard that is not configured throws rather than returning
            // null. Asking config first keeps a missing guard from turning every
            // event write into a swallowed exception and an empty timeline.
            if (config("auth.guards.{$guard}") === null) {
                continue;
            }

            $user = Auth::guard($guard)->user();

            if ($user instanceof Model) {
                return $user;
            }
        }

        return null;
    }

    /** Default source when the caller did not name one. */
    private static function sourceFor(?Model $causer): string
    {
        return match (true) {
            $causer instanceof Admin => self::SOURCE_ADMIN,
            $causer instanceof User => self::SOURCE_OWNER,
            default => self::SOURCE_SYSTEM,
        };
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /**
     * The account behind this event, if there was one and it still exists.
     *
     * Deliberately not a `morphTo` relation: there is no polymorphic map
     * registered for these two, and a timeline that has to eager-load two
     * unrelated tables to print an email address is a worse trade than the
     * label already stored on the row.
     */
    public function causerLabel(): ?string
    {
        if ($this->causer_type === null || $this->causer_id === null) {
            return null;
        }

        /** @var class-string<Model>|null $class */
        $class = Model::getActualClassNameForMorph($this->causer_type);

        if (! class_exists($class)) {
            return $this->causer_type.'#'.$this->causer_id;
        }

        $causer = $class::query()->find($this->causer_id);

        return $causer?->email ?? $causer?->name ?? $this->causer_type.'#'.$this->causer_id;
    }

    /** @param  Builder<self>  $query */
    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }

    /** @param  Builder<self>  $query */
    public function scopeFromSource(Builder $query, string $source): Builder
    {
        return $query->where('source', $source);
    }
}
