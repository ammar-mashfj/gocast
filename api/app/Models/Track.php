<?php

namespace App\Models;

use App\Services\TrackAnalysis;
use Database\Factories\TrackFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

/**
 * One audio file in a station's AutoDJ playlist.
 *
 * The on-disk path is `/var/gocast/playlists/{station-slug}/{id}.{ext}` —
 * the file extension comes from the original upload, the basename is this
 * model's ULID. Music tracks reach Liquidsoap one at a time, as an
 * `annotate:` URI built by PlaylistFileWriter and served by
 * NextTrackController; jingles reach it through `jingles.m3u`, which
 * PlaylistFileWriter regenerates on every mutation.
 *
 * @property string $id
 * @property string $station_id
 * @property string $kind one of KIND_MUSIC | KIND_JINGLE
 * @property string|null $jingle_list_id the jingle list a jingle belongs to
 * @property string $path relative path inside the station's playlist dir, e.g. "01HX....mp3"
 * @property string $original_filename
 * @property string $title
 * @property string|null $artist
 * @property float $duration_seconds the header's figure at upload, the decoded length once measured
 * @property Carbon|null $duration_measured_at set once analysis has decoded the real length
 * @property float|null $loudness_lufs integrated loudness (EBU R128), null until analysed
 * @property float|null $true_peak_db true peak in dBFS, the ceiling on any gain we apply
 * @property float|null $cue_in_seconds where the audio really starts
 * @property float|null $cue_out_seconds where the audio really stops
 * @property Carbon|null $analyzed_at set on success and on failure alike
 * @property string|null $analysis_error why the analyser gave up, if it did
 * @property int $file_size_bytes
 * @property int $position 1-based, gap-free per station AND kind
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Track extends Model
{
    /** @use HasFactory<TrackFactory> */
    use HasFactory, HasUlids;

    /**
     * Part of the AutoDJ rotation — served to Liquidsoap one track at a time,
     * in `position` order, on loop.
     */
    public const KIND_MUSIC = 'music';

    /**
     * A station ID, liner or sweeper — written to `jingles.m3u` and played
     * between rotation tracks on a timer, never in sequence. Order is
     * meaningless here: Liquidsoap reads that playlist in `randomize` mode.
     */
    public const KIND_JINGLE = 'jingle';

    /** @var list<string> */
    public const KINDS = [self::KIND_MUSIC, self::KIND_JINGLE];

    protected $fillable = ['title', 'artist'];

    protected $attributes = [
        'kind' => self::KIND_MUSIC,
    ];

    protected function casts(): array
    {
        return [
            'duration_seconds' => 'float',
            'duration_measured_at' => 'datetime',
            'loudness_lufs' => 'float',
            'true_peak_db' => 'float',
            'cue_in_seconds' => 'float',
            'cue_out_seconds' => 'float',
            'analyzed_at' => 'datetime',
            'file_size_bytes' => 'integer',
            'position' => 'integer',
        ];
    }

    /**
     * @param  Builder<Track>  $query
     */
    public function scopeMusic($query): void
    {
        $query->where('kind', self::KIND_MUSIC);
    }

    /**
     * @param  Builder<Track>  $query
     */
    public function scopeJingles($query): void
    {
        $query->where('kind', self::KIND_JINGLE);
    }

    /**
     * Seconds this track is on air: from cue-in (or the start) to cue-out
     * (or the end), judged by the same rule the annotation uses, so the
     * planner counts exactly what Liquidsoap plays.
     *
     * Null until the length has been measured. A header's guess can be off
     * by seconds, and planning a hard start around it would miss the mark.
     */
    public function airtimeSeconds(): ?float
    {
        if ($this->duration_measured_at === null || $this->duration_seconds <= 0) {
            return null;
        }

        [$cueIn, $cueOut] = (new TrackAnalysis(
            cueInSeconds: $this->cue_in_seconds,
            cueOutSeconds: $this->cue_out_seconds,
        ))->cuePoints($this->duration_seconds);

        return ($cueOut ?? $this->duration_seconds) - ($cueIn ?? 0.0);
    }

    public function isJingle(): bool
    {
        return $this->kind === self::KIND_JINGLE;
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    public function jingleList(): BelongsTo
    {
        return $this->belongsTo(JingleList::class);
    }

    /**
     * The playlists this track is in. Music only in practice — jingles are
     * refused at the pivot — and a music track in none of them never plays,
     * which the library view flags.
     */
    public function playlists(): BelongsToMany
    {
        return $this->belongsToMany(Playlist::class)->withPivot('position');
    }
}
