<?php

namespace App\Models;

use Database\Factories\PlaylistFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

/**
 * A named, ordered subset of a station's music tracks — one rotation among
 * possibly several.
 *
 * Every station has exactly one playlist with `is_default` set. It is
 * created with the station, cannot be deleted, and is what AutoDJ plays
 * whenever nothing else is scheduled. For stations that predate playlists it
 * is the old rotation, cursor and shuffle deck included (see the backfill
 * migration).
 *
 * The rotation state (`order`, `cursor_position`, `deck`) is per playlist so
 * that leaving one for another and coming back resumes where it left off.
 * AutoDjScheduler writes `cursor_position` and `deck` with the query builder
 * at every track boundary — never through this model — so no observer, log
 * entry or `updated_at` bump can happen on the audio path.
 *
 * @property string $id
 * @property string $station_id
 * @property string $name
 * @property bool $is_default
 * @property string $order one of ORDER_SEQUENTIAL | ORDER_SHUFFLE
 * @property int|null $cursor_position pivot position of the track last handed out (sequential)
 * @property list<string>|null $deck unplayed remainder of the current shuffle cycle, as track IDs
 * @property int $position display order among the station's playlists
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Playlist extends Model
{
    /** @use HasFactory<PlaylistFactory> */
    use HasFactory, HasUlids;

    /**
     * Walk the playlist in pivot `position` order, wrapping at the end. The
     * order the owner set with the drag handles, played as written.
     */
    public const ORDER_SEQUENTIAL = 'sequential';

    /**
     * Play a random permutation of the playlist, dealing a fresh one each
     * time the last is exhausted. Deliberately not called "random": a random
     * pick per track can repeat a song immediately, which is never what
     * anyone means. Every track airs exactly once before any track airs twice.
     */
    public const ORDER_SHUFFLE = 'shuffle';

    /** @var list<string> */
    public const ORDERS = [self::ORDER_SEQUENTIAL, self::ORDER_SHUFFLE];

    /** What the default playlist is called when the station is created. */
    public const DEFAULT_NAME = 'Main rotation';

    /** @var list<string> */
    protected $fillable = ['name', 'order', 'position'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'is_default' => false,
        'order' => self::ORDER_SEQUENTIAL,
        'position' => 0,
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'cursor_position' => 'integer',
            'deck' => 'array',
            'position' => 'integer',
        ];
    }

    public function isDefault(): bool
    {
        return $this->is_default;
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /**
     * The playlist's members in play order.
     *
     * Scoped to music defensively: the pivot only ever receives music tracks
     * (PlaylistTracksRequest refuses jingles), but a track recategorised
     * after being attached must not become a rotation entry by accident.
     */
    public function tracks(): BelongsToMany
    {
        return $this->belongsToMany(Track::class)
            ->where('tracks.kind', Track::KIND_MUSIC)
            ->withPivot('position')
            ->orderByPivot('position');
    }
}
