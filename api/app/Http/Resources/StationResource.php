<?php

namespace App\Http\Resources;

use App\Models\Station;
use App\Models\StreamSession;
use App\Services\StationStatusService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Redis;

/**
 * API resource for station data.
 *
 * Nothing here is stored state. `desired_state` (owner intent) is the only
 * column involved; `is_live`, `is_on_air` and `state` are all derived per
 * request, which is why there is no longer an `is_live` column to fall out of
 * sync with the container.
 *
 * This is the CHEAP tier, deliberately: it answers from intent plus one SQL
 * query, and never opens a socket to a station container. /discover renders 24
 * stations a page, and asking harbor per row would mean 24 HTTP calls per page
 * view. The consequence is that this tier cannot tell a container that is still
 * booting (or has just died) from one that is happily on air — it reports the
 * owner's intent. Two endpoints pay for the precise answer instead:
 *
 *   • GET /stations/{slug}/status  — full state, incl. starting/degraded
 *   • GET /public/stations/{slug}/listeners — what the player polls
 *
 * Live-ness comes from an open StreamSession rather than Redis: the broadcast
 * state key has a 90s TTL that nothing refreshes mid-broadcast, so it goes cold
 * on any broadcast longer than 90 seconds. The session row does not.
 *
 * To keep list responses to one Redis round-trip and one extra query total, the
 * static collection() override batch-fetches both and stashes them in a
 * per-request memo; toArray() then reads the memo. Single-resource responses
 * fall back to individual reads — N=1 either way.
 *
 * Includes computed stats (total sessions, cumulative airtime, peak listeners)
 * only when the streamSessions relation is eager-loaded, keeping list responses lean.
 */
class StationResource extends JsonResource
{
    /**
     * Request-attribute key holding the per-request preload map. Stashing
     * it on the request (rather than a class-level static) keeps the cache
     * scoped to a single HTTP request under persistent-PHP runtimes like
     * FrankenPHP/Octane where statics survive across requests.
     */
    private const PRELOAD_ATTR = 'station_resource_preloaded';

    /**
     * @param  Collection<int, Station>|iterable<Station>  $resource
     */
    public static function collection($resource): ResourceCollection
    {
        self::preloadFor($resource);

        return parent::collection($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $map = $request->attributes->get(self::PRELOAD_ATTR, []);
        $preloaded = $map[$this->id] ?? $this->loadRealtimeState();

        // is_live: a real human broadcaster is publishing into MediaMTX right
        // now — derived from the session the runOnReady/runOnNotReady webhook
        // chain opens and closes, never from a stored flag.
        $isRunning = $this->resource->isRunning();
        $isLive = $isRunning && $preloaded['is_live'];
        $nowPlaying = $preloaded['metadata'];

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'genre' => $this->genre,
            'artwork_url' => $this->artwork_url,
            'is_live' => $isLive,
            // is_on_air: the listener-facing "can I hear anything" flag — the
            // station's mount exists and a player that connects will stay
            // connected. True for live broadcasts AND for AutoDJ rotations,
            // and — deliberately — for a running station playing silence.
            //
            // This used to additionally require now-playing metadata, which
            // meant a station with an empty playlist, or one playing a file
            // with no ID3 tags, reported itself offline while its Icecast
            // mount was up and serving. Metadata answers "what is playing", a
            // display question; it was never evidence of availability. The
            // only guard that mattered — don't claim a stopped station is
            // audible — is $isRunning, which is still here.
            'is_on_air' => $isRunning,
            // Owner intent, and the coarse state derived from it. This is the
            // cheap answer: it costs no network call, so list endpoints stay
            // at one Redis round-trip. It cannot tell "booting" from "on air"
            // — GET /stations/{slug}/status asks the container itself and
            // returns the precise state, including 'starting' and 'degraded'.
            'desired_state' => $this->desired_state,
            'started_at' => $this->started_at,
            'state' => match (true) {
                ! $isRunning => StationStatusService::STATE_OFFLINE,
                $isLive => StationStatusService::STATE_LIVE,
                default => StationStatusService::STATE_ON_AIR,
            },
            'now_playing' => $this->nowPlaying($nowPlaying),
            'icecast_mount' => $this->icecast_mount,
            // Owner-facing AutoDJ config. Cheap (plain columns) and the
            // library screen needs them to render its jingle dialog without
            // a second round trip.
            // READ-ONLY, and the only place the watermark appears in the API.
            // It is derived from the owner's plan, has no station column, and
            // is absent from UpdateStationRequest — a free user must not be
            // one PATCH away from removing the thing they pay to remove. It is
            // surfaced at all so the dashboard can say so honestly, and offer
            // the upgrade, rather than leaving people wondering what the voice
            // on their stream is.
            //
            // Owner-only, for two independent reasons. It would otherwise tell
            // the whole internet which stations are on the free plan, via
            // /discover. And it is read off the AUTHENTICATED user rather than
            // off each station's owner, so a page of stations costs one plan
            // query in total instead of one per row — this resource is
            // deliberately N+1-free and must stay that way.
            'watermarked' => $this->when(
                $request->user()?->id === $this->user_id,
                fn () => $request->user()->watermarked(),
            ),
            'jingles_enabled' => (bool) $this->jingles_enabled,
            'jingle_mode' => $this->jingle_mode,
            'jingle_interval_seconds' => (int) $this->jingle_interval_seconds,
            'jingle_every_tracks' => (int) $this->jingle_every_tracks,
            'social_links' => $this->social_links,
            'theme_config' => $this->theme_config,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'stats' => $this->whenLoaded('streamSessions', function () {
                $sessions = $this->streamSessions->whereNotNull('ended_at');

                $totalAirtimeSeconds = $sessions->sum(fn ($s) => $s->started_at->diffInSeconds($s->ended_at));

                return [
                    'sessions' => $sessions->count(),
                    'total_airtime_seconds' => $totalAirtimeSeconds,
                    'peak_listeners' => $sessions->max('peak_listeners') ?? 0,
                ];
            }),
        ];
    }

    /**
     * @param  iterable<Station>  $stations
     */
    private static function preloadFor(iterable $stations): void
    {
        $request = app('request');
        $request->attributes->set(self::PRELOAD_ATTR, []);

        $ids = Collection::make($stations)
            ->pluck('id')
            ->filter()
            ->values()
            ->all();

        if ($ids === []) {
            return;
        }

        // One MGET for the now-playing payloads — replaces N round trips.
        $metadataKeys = array_map(fn ($id) => "metadata:{$id}", $ids);
        $metadataValues = Redis::mget($metadataKeys);

        // One query for live-ness across the whole page, rather than an
        // exists() per row. Stations with an open StreamSession have a
        // publisher connected right now.
        $liveIds = StreamSession::query()
            ->whereIn('station_id', $ids)
            ->whereNull('ended_at')
            ->distinct()
            ->pluck('station_id')
            ->flip();

        $map = [];
        foreach ($ids as $i => $id) {
            $rawMetadata = $metadataValues[$i] ?? null;
            $metadata = is_string($rawMetadata) ? json_decode($rawMetadata, true) : null;

            $map[$id] = [
                'is_live' => $liveIds->has($id),
                'metadata' => is_array($metadata) ? $metadata : null,
            ];
        }

        $request->attributes->set(self::PRELOAD_ATTR, $map);
    }

    /**
     * Slow path for single-resource responses (show endpoints). N=1 either way.
     *
     * @return array{is_live: bool, metadata: array<string, mixed>|null}
     */
    private function loadRealtimeState(): array
    {
        $rawMetadata = Redis::get("metadata:{$this->id}");
        $metadata = is_string($rawMetadata) ? json_decode($rawMetadata, true) : null;

        return [
            'is_live' => $this->resource->isLive(),
            'metadata' => is_array($metadata) ? $metadata : null,
        ];
    }

    /**
     * Now-playing payload, or null when nothing identifiable is on air.
     *
     * Absent metadata is not evidence of being off air — a station rotating
     * untagged files, or playing silence behind an empty playlist, is still
     * on air with nothing to name. It only means there is no title to show.
     *
     * @param  array<string, mixed>|null  $metadata
     * @return array{title: ?string, artist: ?string}|null
     */
    private function nowPlaying(?array $metadata): ?array
    {
        if (! $this->resource->isRunning() || ! is_array($metadata)) {
            return null;
        }

        if (empty($metadata['title']) && empty($metadata['artist'])) {
            return null;
        }

        return [
            'title' => $metadata['title'] ?? null,
            'artist' => $metadata['artist'] ?? null,
        ];
    }
}
