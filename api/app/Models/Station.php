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
 * @property string|null $timezone IANA name the advertised show times are written in
 * @property string|null $artwork_url
 * @property bool $is_live
 * @property bool $featured
 * @property Carbon|null $featured_at
 * @property string $desired_state
 * @property Carbon|null $started_at
 * @property Carbon|null $silent_since
 * @property Carbon|null $last_ready_at
 * @property string $icecast_mount
 * @property string $icecast_password
 * @property string|null $stream_key long-lived credential an external encoder authenticates with
 * @property Carbon|null $stream_key_rotated_at
 * @property string $autodj_order one of AUTODJ_ORDER_SEQUENTIAL | AUTODJ_ORDER_SHUFFLE
 * @property list<string>|null $autodj_deck unplayed remainder of the current shuffle
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
     * How many links a station may advertise on its player page.
     *
     * A layout bound rather than a plan one — links are free on every plan.
     * Past roughly this many the icon row stops reading as a set of places to
     * find the station and starts reading as a site footer.
     */
    public const MAX_SOCIAL_LINKS = 8;

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
     * Walk the rotation in `position` order, wrapping at the end. The order
     * the owner set with the drag handles in the library, played as written.
     */
    public const AUTODJ_ORDER_SEQUENTIAL = 'sequential';

    /**
     * Play a random permutation of the rotation, dealing a fresh one each time
     * the last is exhausted. Deliberately not called "random": a random pick
     * per track can repeat a song immediately, which is never what anyone
     * means. Every track airs exactly once before any track airs twice.
     */
    public const AUTODJ_ORDER_SHUFFLE = 'shuffle';

    /** @var list<string> */
    public const AUTODJ_ORDERS = [self::AUTODJ_ORDER_SEQUENTIAL, self::AUTODJ_ORDER_SHUFFLE];

    /**
     * How many featured stations the public rail shows. Featuring more than
     * this is allowed — it is curation, not a queue — but the extras are not
     * visible, which is why the admin panel counts against this number rather
     * than refusing the write.
     */
    public const FEATURED_RAIL_SIZE = 4;

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
            // The encoder's password, minted here rather than on first use so
            // the settings card always has something to show. A station with a
            // key but a free owner is not a leak: HarborAuthController checks
            // the plan on every connection attempt, and the API never renders
            // the value to an account that may not use it.
            $station->stream_key ??= static::generateStreamKey();
            // Set here as well as in the column default so the in-memory
            // model is never a null state: isRunning() and the API resource
            // both read this immediately after create(), before any refresh.
            $station->desired_state ??= self::STATE_STOPPED;

            // Same reasoning. LiquidsoapSupervisor renders the .liq straight
            // off the in-memory model, so a null interval here would reach
            // delay() as 0 — a jingle between every single track.
            $station->autodj_order ??= self::AUTODJ_ORDER_SEQUENTIAL;

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

    /**
     * A fresh encoder password.
     *
     * [A-Za-z0-9] only. This value is typed into someone else's software and
     * then travels two ways we do not control: base64'd into
     * `Authorization: Basic`, and — on libshout's separate metadata
     * connection — url-encoded into a query string. Encoder UIs disagree about
     * escaping punctuation, and every disagreement surfaces as an auth refusal
     * with no clue attached. 32 characters of that alphabet is ~190 bits,
     * which is plenty without spending any of it on symbols.
     *
     * Str::password() draws every character with random_int(), so the bytes
     * come from the same CSPRNG that backs `icecast_password` — a different
     * helper, not a weaker one. Worth stating explicitly because the obvious
     * way to get this alphabet is a filtered Str::random(), and that is NOT
     * what runs here; anyone auditing the credential should be reading
     * random_int's guarantees, not base64's.
     */
    public static function generateStreamKey(): string
    {
        return Str::password(32, letters: true, numbers: true, symbols: false, spaces: false);
    }

    /**
     * Mint a new encoder password, timestamped.
     *
     * forceFill, matching markFeatured(): this is not a column a request
     * payload may reach — UpdateStationRequest ignores it, and rotation is its
     * own endpoint precisely so a user cannot choose their own credential.
     *
     * Does NOT disconnect whoever is broadcasting right now. Harbor
     * authenticates once, at connect time, so a live show survives its own
     * key being rotated and the new value takes effect at the next
     * connection. The settings card says so rather than implying otherwise.
     */
    public function rotateStreamKey(): string
    {
        $key = static::generateStreamKey();

        $this->forceFill([
            'stream_key' => $key,
            'stream_key_rotated_at' => now(),
        ])->save();

        return $key;
    }

    protected function casts(): array
    {
        return [
            'featured' => 'boolean',
            // Encrypted rather than hashed: the settings card has to redisplay
            // it. See the migration that added the column for the trade.
            'stream_key' => 'encrypted',
            'stream_key_rotated_at' => 'datetime',
            'featured_at' => 'datetime',
            'autodj_deck' => 'array',
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

    /**
     * Admin-curated stations. Filter only — the public rail applies its own
     * ordering, and it has to, because an unordered LIMIT over more featured
     * stations than there are slots returns a different set of stations
     * depending on how the storage engine feels that request.
     *
     * @param  Builder<Station>  $query
     */
    public function scopeFeatured($query): void
    {
        $query->where('featured', true);
    }

    /**
     * Put this station in the featured rail, or take it out.
     *
     * The flag and its timestamp are written together, here, because they are
     * one decision: a `featured` row with no `featured_at` sorts to the bottom
     * of the rail forever, and a `featured_at` left behind on an unfeatured
     * row makes "featured since" read as a lie the next time it is picked up.
     *
     * forceFill, matching WaitlistEntry::markReviewed(): these are admin-owned
     * columns and must not be reachable through a request payload.
     */
    public function markFeatured(bool $featured): void
    {
        $this->forceFill([
            'featured' => $featured,
            'featured_at' => $featured ? now() : null,
        ])->save();
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
     * This station's timeline — boots, Icecast connects, broadcasters coming
     * and going, uploads, power-button presses — newest first.
     *
     * Distinct from {@see streamSessions()}, which records only the windows a
     * human was on air, and from the station's `activity_log` rows, which
     * record only edits a person made to its settings. See {@see StationEvent}
     * for why the three are separate tables.
     */
    public function events(): HasMany
    {
        return $this->hasMany(StationEvent::class)->latest('created_at');
    }

    /**
     * Permanent hourly listener rollups — the only honest source for anything
     * about this station's AUDIENCE.
     *
     * Not {@see streamSessions()}, which describes broadcasts. Every audience
     * figure ever sourced from that relation has been wrong in the same way:
     * it can only see hours when a human held the microphone, so a station
     * running AutoDJ to a real audience reports nothing. This relation covers
     * every hour the station had listeners, live or not, and includes the
     * Icecast listeners who never open a session row.
     */
    public function listenerStats(): HasMany
    {
        return $this->hasMany(ListenerStatHourly::class);
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

    /**
     * Advertised show times — the owner's claim about when a human is on.
     *
     * Display only: nothing here reaches the container, the scheduler or
     * `desired_state`. Ordered by the owner's own arrangement rather than by
     * clock, because the flagship show is not always the earliest one.
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(StationSchedule::class)->orderBy('position');
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'slug', 'description', 'genre', 'featured', 'desired_state'])
            // `featured_at` is deliberately absent: it moves in lockstep with
            // `featured`, and logging both would put the same decision in the
            // audit trail twice.
            ->logOnlyDirty()
            ->dontLogEmptyChanges();
    }
}
