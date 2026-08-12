<?php

namespace App\Http\Resources;

use App\Models\Station;
use App\Services\BroadcastStateService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Redis;

/**
 * API resource for station data.
 *
 * Real-time fields (is_live, now_playing) come from Redis — and Redis is the
 * hot path for list endpoints like /discover. To keep list responses to one
 * Redis round-trip total, we batch-fetch both keys via mget in the static
 * collection() override and stash the results in a per-request memo; each
 * resource's toArray() then reads from the memo instead of issuing its own
 * Redis call. Single-resource responses (show()) fall back to individual
 * gets — N=1 either way.
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
        // now. Driven by the WHIP runOnReady/runOnNotReady webhook chain.
        // Redis cache is real-time; DB column is the durable fallback for
        // when the cache is evicted / Redis restarts.
        $isLive = $preloaded['is_live'] || (bool) $this->is_live;
        $nowPlaying = $preloaded['metadata'];
        $hasMetadata = is_array($nowPlaying) && (! empty($nowPlaying['title']) || ! empty($nowPlaying['artist']));

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'genre' => $this->genre,
            'artwork_url' => $this->artwork_url,
            'is_live' => $isLive,
            // is_on_air: the listener-facing "is there anything to hear" flag.
            // True for live broadcasts AND for AutoDJ rotations.
            'is_on_air' => $isLive || $hasMetadata,
            'now_playing' => $hasMetadata ? [
                'title' => $nowPlaying['title'] ?? null,
                'artist' => $nowPlaying['artist'] ?? null,
            ] : null,
            'icecast_mount' => $this->icecast_mount,
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

        // Broadcast state ("is the publisher connected right now") lives in
        // the default cache store. cache()->many() collapses to a single
        // Redis MGET when the cache driver is Redis.
        $broadcastState = app(BroadcastStateService::class);
        $stateKeys = array_map(fn ($id) => "broadcast:station:{$id}", $ids);
        $states = cache()->many($stateKeys);

        $map = [];
        foreach ($ids as $i => $id) {
            $rawMetadata = $metadataValues[$i] ?? null;
            $metadata = is_string($rawMetadata) ? json_decode($rawMetadata, true) : null;

            $map[$id] = [
                'is_live' => $broadcastState->isLiveFromState($states["broadcast:station:{$id}"] ?? null),
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
            'is_live' => app(BroadcastStateService::class)->isLive($this->resource),
            'metadata' => is_array($metadata) ? $metadata : null,
        ];
    }
}
