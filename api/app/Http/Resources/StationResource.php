<?php

namespace App\Http\Resources;

use App\Models\Station;
use App\Models\StationSchedule;
use App\Models\StreamSession;
use App\Services\AutoDjProgramme;
use App\Services\StationStatusService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
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
     * Compose the `encoder` block on this response?
     *
     * OFF BY DEFAULT, and that default is the point. The block carries the
     * station's stream key in plaintext — a long-lived credential — and this
     * resource is rendered by ten call sites: the owner's station list, the
     * public directory, /discover, the embed payload, every power toggle, the
     * schedule editor. Two of them opt in.
     *
     * Note that opting in is not the same as rendering a card: show() is the
     * fetch behind the station overview and the go-live page as well as
     * settings, so three owner-facing screens receive the block. That is
     * intended — the go-live dialog offers the encoder as a way to broadcast,
     * and the overview's power card is what opens it — and it is why the gate
     * that matters is ownership and plan below rather than this flag.
     *
     * Ownership and plan are still checked in toArray() regardless; this is
     * the narrower question of whether a given RESPONSE has any use for the
     * credential. Gating on opt-in rather than on the route keeps the answer
     * next to the controller that needs it instead of in a string match that
     * silently changes meaning when a route is renamed.
     *
     * Opting in from a collection endpoint would be a mistake rather than a
     * choice, so there is no way to — the static collection() override below
     * never calls withEncoder().
     */
    protected bool $withEncoder = false;

    /**
     * Include the encoder connection details in this response.
     *
     * For the two places a DJ is actually looking at the card: the station
     * fetch behind the settings page (StationController::show) and the
     * rotation that mints a new key (StreamKeyController::rotate), which has
     * to hand the new value straight back or the field shows the dead one.
     */
    public function withEncoder(): static
    {
        $this->withEncoder = true;

        return $this;
    }

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

        // is_live: a real human broadcaster is publishing into the station's
        // harbor input right now — derived from the session the
        // live_connected/live_disconnected events open and close, never from
        // a stored flag.
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
            // The clock `schedules` below are written in. Public: a
            // listener in another country needs it to convert the show
            // times into their own, which is the entire point of them.
            'timezone' => $this->timezone,
            'artwork_url' => $this->artwork_url,
            // Admin curation, and the one admin-owned column that is public.
            //
            // Unconditional, unlike `watermarked` below: being featured is an
            // endorsement the station is meant to wear, so the badge has to
            // render for a stranger who arrived on a shared link and not only
            // for the owner. It leaks nothing a visitor cannot already infer
            // by looking at the homepage rail.
            //
            // Says nothing about whether the station is on the homepage right
            // now — the rail additionally requires the station to be on air
            // and truncates to Station::FEATURED_RAIL_SIZE. This is the
            // editorial fact; the rail is the display of it.
            'featured' => (bool) $this->featured,
            // Whether the player page may be indexed — see
            // Station::scopeIndexable(). Only where the caller loaded
            // withIndexability(), which today is the public show endpoint:
            // computing it per row elsewhere would cost two queries a row.
            'indexable' => $this->when(
                array_key_exists('has_broadcast_history', $this->resource->getAttributes()),
                fn () => $this->resource->isIndexable(),
            ),
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
            // The player's stream URL, resolved server-side so the client
            // never has to spell the filename.
            //
            // It points at the MEDIA playlist, not the `playlist.m3u8` master
            // Liquidsoap writes beside it. Players resolve a master's variant
            // URI relative to it and drop any query string on the way, so a
            // master URL cannot carry a per-listener token through to the
            // requests that follow — and with a single rendition it buys
            // nothing in exchange. The filename comes from the same config
            // value that names the encoder in station.blade.php, so the two
            // cannot drift.
            //
            // Null when no stream host is configured, which is a supported
            // state: the player falls back to the Icecast mount above.
            'hls_url' => $this->hlsUrl(),
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
            // Everything a DJ types into BUTT, Mixxx or RadioDJ, composed
            // server-side so the client never guesses a port or a mount.
            //
            // Four gates, all of which have to hold:
            //
            //   • ASKED FOR. This resource renders the owner's station list,
            //     the public directory and every power toggle as well as the
            //     settings page, and only the last of those has anywhere to
            //     put a credential. See $withEncoder.
            //   • OWNER ONLY. `password` is a live credential. It follows the
            //     same N+1 discipline as `watermarked` above — the plan is
            //     read off the AUTHENTICATED user, never off each row's owner
            //     — so a page of stations still costs one plan query.
            //   • PLAN. HarborAuthController is what actually refuses a
            //     downgraded account's key; this stops the dashboard from
            //     handing out settings that will not work.
            //   • DEPLOYED. No `encoder_host` configured means the ingest
            //     router is not running here, and the card should say so
            //     rather than print a hostname that resolves to nothing.
            //
            // `stream_key` itself is absent from UpdateStationRequest, for the
            // same reason `watermarked` is: rotation is its own endpoint so
            // nobody can choose their own credential.
            'encoder' => $this->when(
                $this->withEncoder
                    && $request->user()?->id === $this->user_id
                    && $request->user()->canUseEncoder()
                    && filled(config('liquidsoap.encoder_host')),
                fn () => [
                    'host' => config('liquidsoap.encoder_host'),
                    'port' => (int) config('liquidsoap.encoder_port'),
                    // Harbor registers its mount at the bare slug; the leading
                    // slash is what every encoder UI expects to be typed.
                    'mount' => '/'.$this->slug,
                    // Not a real account. Harbor hands whatever libshout put
                    // in Authorization: Basic to the auth callback, which only
                    // reads the password — but the field is mandatory in every
                    // encoder, and `source` is the Icecast convention.
                    'username' => 'source',
                    // Read through the `encrypted` cast, which THROWS on a
                    // key it cannot decrypt — after an APP_KEY rotation, say.
                    // Unguarded that takes down the whole station payload, and
                    // with it the settings page hosting the rotate button, so
                    // the one documented recovery path would be unreachable
                    // exactly when it is needed. Degrade to a null password
                    // instead and let the card tell the owner to rotate.
                    'password' => $this->readableStreamKey(),
                    'rotated_at' => $this->stream_key_rotated_at,
                ],
            ),
            'jingles_enabled' => (bool) $this->jingles_enabled,
            'jingle_mode' => $this->jingle_mode,
            'jingle_interval_seconds' => (int) $this->jingle_interval_seconds,
            'jingle_every_tracks' => (int) $this->jingle_every_tracks,
            'social_links' => $this->social_links,
            'theme_config' => $this->theme_config,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            // Advertised show times. whenLoaded is load-bearing: /discover
            // renders 24 stations a page and this resource is deliberately
            // N+1-free, so the relation is eager-loaded only on the two show
            // endpoints that actually render a schedule.
            'schedules' => $this->whenLoaded('schedules', function () {
                // Hand each row the station it already belongs to. Without
                // this, next_occurrence's timezone lookup would lazy-load the
                // inverse relation once per row — the N+1 this resource spends
                // a preload map avoiding everywhere else.
                $schedules = $this->resource->schedules->each(
                    fn (StationSchedule $schedule) => $schedule->setRelation('station', $this->resource),
                );

                return StationScheduleResource::collection($schedules);
            }),
            // The AutoDJ programme. Owner-only pages load `autodjSlots`
            // (show(), the slot save); nothing public does, so neither key
            // appears there. `programme` is resolved per request from the
            // loaded relations — one small computation, no extra queries
            // beyond the empty-playlist check.
            'autodj_slots' => $this->whenLoaded('autodjSlots', fn () => AutodjSlotResource::collection($this->autodjSlots)),
            'programme' => $this->whenLoaded('autodjSlots', function () {
                $programme = app(AutoDjProgramme::class)->resolve($this->resource);

                return [
                    'playlist' => $programme['playlist'] === null ? null : [
                        'id' => $programme['playlist']->id,
                        'name' => $programme['playlist']->name,
                    ],
                    'slot_id' => $programme['slot']?->id,
                    'until' => $programme['until']?->toIso8601String(),
                    'next' => $programme['next'] === null ? null : [
                        'slot_id' => $programme['next']['slot']->id,
                        'label' => $programme['next']['slot']->label,
                        'playlist' => [
                            'id' => $programme['next']['slot']->playlist?->id,
                            'name' => $programme['next']['slot']->playlist?->name,
                        ],
                        'starts_at' => $programme['next']['starts_at']->toIso8601String(),
                    ],
                ];
            }),
            'stats' => $this->whenLoaded('streamSessions', function () {
                // Broadcast figures: these genuinely are about someone holding
                // the microphone, so stream_sessions is the right source.
                // Closed sessions only — an in-progress broadcast has no
                // duration to add yet.
                $sessions = $this->streamSessions->whereNotNull('ended_at');

                $totalAirtimeSeconds = $sessions->sum(fn ($s) => $s->started_at->diffInSeconds($s->ended_at));

                return [
                    'sessions' => $sessions->count(),
                    'total_airtime_seconds' => $totalAirtimeSeconds,

                    // AUDIENCE figure, so it does not come from the broadcasts.
                    // Read as `max(stream_sessions.peak_listeners)` this was
                    // wrong twice over: a station that has only ever run AutoDJ
                    // has no stream_sessions at all and reported 0 no matter how
                    // many people listened, and `whereNotNull('ended_at')` hid
                    // the broadcast in progress, so a station having its best
                    // ever hour right now showed the previous best.
                    //
                    // The hourly rollup has neither problem: `listeners:sweep`
                    // writes a row for every station with an audience, live or
                    // AutoDJ, and the table is never pruned. One aggregate query
                    // rather than an eager load, because a value that silently
                    // reads 0 when someone forgets to load a relation is the
                    // exact failure being fixed here. This resource renders
                    // `stats` for a single station on a single endpoint.
                    'peak_listeners' => (int) $this->listenerStats()->max('peak_listeners'),
                ];
            }),
        ];
    }

    /** @see config/liquidsoap.php — `hls_base_url` and `hls_variant`. */
    private function hlsUrl(): ?string
    {
        $base = (string) config('liquidsoap.hls_base_url');

        if ($base === '') {
            return null;
        }

        return "{$base}/{$this->slug}/".config('liquidsoap.hls_variant').'.m3u8';
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

    /**
     * The station's stream key, or null when it cannot be decrypted.
     *
     * Mirrors the guard in HarborAuthController::streamKeyMatches(): an
     * unreadable key is a recoverable state (rotate it), not a 500.
     */
    private function readableStreamKey(): ?string
    {
        try {
            return $this->stream_key;
        } catch (\Throwable $e) {
            Log::warning('Could not read a station stream key for the encoder card', [
                'station' => $this->slug,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
