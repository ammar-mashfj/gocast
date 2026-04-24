<?php

namespace App\Services;

use App\Models\Station;
use App\Models\StreamSession;

class BroadcastStateService
{
    private const ACTIVE_STATUSES = ['starting', 'live', 'reconnecting'];

    public const LIVE_TTL_SECONDS = 90;

    public const STARTING_TTL_SECONDS = 60;

    public const RECONNECTING_TTL_SECONDS = 45;

    /**
     * @return array<string, mixed>|null
     */
    public function activeForStation(Station $station): ?array
    {
        $state = cache()->get($this->key($station));

        return is_array($state) ? $state : null;
    }

    public function isLive(Station $station): bool
    {
        $state = $this->activeForStation($station);

        return in_array($state['status'] ?? null, self::ACTIVE_STATUSES, true);
    }

    /**
     * Reserve the station while the browser is still connecting to the relay.
     *
     * @return array<string, mixed>
     */
    public function markStarting(Station $station, StreamSession $session, string $deviceId): array
    {
        return $this->put($station, $session, $deviceId, null, 'starting', self::STARTING_TTL_SECONDS);
    }

    /**
     * @return array<string, mixed>
     */
    public function markLive(Station $station, StreamSession $session, string $deviceId, string $connectionId): array
    {
        return $this->put($station, $session, $deviceId, $connectionId, 'live', self::LIVE_TTL_SECONDS);
    }

    /**
     * @return array<string, mixed>
     */
    public function markReconnecting(Station $station, StreamSession $session, string $deviceId, string $connectionId): array
    {
        return $this->put($station, $session, $deviceId, $connectionId, 'reconnecting', self::RECONNECTING_TTL_SECONDS);
    }

    public function forget(Station $station): void
    {
        cache()->forget($this->key($station));
    }

    /**
     * @param  array<string, mixed>|null  $state
     */
    public function sameDevice(?array $state, string $deviceId): bool
    {
        return is_array($state) && ($state['device_id'] ?? null) === $deviceId;
    }

    private function key(Station $station): string
    {
        return "broadcast:station:{$station->id}";
    }

    /**
     * @return array<string, mixed>
     */
    private function put(
        Station $station,
        StreamSession $session,
        string $deviceId,
        ?string $connectionId,
        string $status,
        int $ttlSeconds,
    ): array {
        $now = now()->toISOString();
        $state = [
            'station_id' => $station->id,
            'slug' => $station->slug,
            'session_id' => $session->id,
            'user_id' => $station->user_id,
            'device_id' => $deviceId,
            'connection_id' => $connectionId,
            'status' => $status,
            'started_at' => $session->started_at?->toISOString(),
            'heartbeat_at' => $now,
        ];

        cache()->put($this->key($station), $state, now()->addSeconds($ttlSeconds));

        return $state;
    }
}
