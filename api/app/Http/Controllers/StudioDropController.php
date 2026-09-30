<?php

namespace App\Http\Controllers;

use App\Models\Station;
use App\Models\StationEvent;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Receives the studio's account of why its broadcast socket dropped.
 *
 * Harbor's `live_disconnected` carries no reason, because the server only sees
 * a socket go away. The browser knows what the page was doing when it went, so
 * the studio writes a report at the drop, keeps it on the device, and sends it
 * here once it knows how the reconnect ended. Reports can therefore arrive in
 * batches, late, and more than once (a page-close send can't be confirmed);
 * the per-report `id` is what makes a repeat harmless.
 *
 * Admin monitoring only, like every StationEvent. Nothing branches on these
 * rows, and a report that fails validation is simply not recorded.
 */
class StudioDropController extends Controller
{
    use AuthorizesRequests;

    /** One report per id is kept for this long; resends after it are rare. */
    private const DEDUPE_SECONDS = 86400 * 2;

    /**
     * Property whitelist, in display order. Anything not listed here is
     * dropped rather than stored, so the client can't grow the row freely.
     *
     * @var list<string>
     */
    private const FIELDS = [
        'outcome', 'dropped_at', 'down_ms', 'attempts', 'last_error',
        'connected_ms', 'close_code', 'close_reason', 'was_clean',
        'visibility', 'hidden_for_ms', 'shown_ago_ms', 'resumed_ago_ms', 'frozen',
        'online', 'offline_ago_ms', 'net_type', 'net_effective', 'net_downlink', 'net_rtt', 'save_data',
        'buffered_bytes', 'peak_buffered_bytes', 'wake_lock', 'standalone',
        'bitrate', 'uplink_kbps',
    ];

    public function __invoke(Request $request, Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $validated = $request->validate([
            'drops' => ['required', 'array', 'min:1', 'max:20'],
            'drops.*.id' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
            'drops.*.outcome' => ['required', 'string', 'in:reconnected,gave_up,stopped,page_closed,unknown'],
            'drops.*.dropped_at' => ['required', 'date'],
            'drops.*.down_ms' => ['nullable', 'integer', 'min:0'],
            'drops.*.attempts' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'drops.*.last_error' => ['nullable', 'string', 'max:200'],
            'drops.*.connected_ms' => ['nullable', 'integer', 'min:0'],
            'drops.*.close_code' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'drops.*.close_reason' => ['nullable', 'string', 'max:123'],
            'drops.*.was_clean' => ['nullable', 'boolean'],
            'drops.*.visibility' => ['nullable', 'string', 'in:visible,hidden'],
            'drops.*.hidden_for_ms' => ['nullable', 'integer', 'min:0'],
            'drops.*.shown_ago_ms' => ['nullable', 'integer', 'min:0'],
            'drops.*.resumed_ago_ms' => ['nullable', 'integer', 'min:0'],
            'drops.*.frozen' => ['nullable', 'boolean'],
            'drops.*.online' => ['nullable', 'boolean'],
            'drops.*.offline_ago_ms' => ['nullable', 'integer', 'min:0'],
            'drops.*.net_type' => ['nullable', 'string', 'max:16'],
            'drops.*.net_effective' => ['nullable', 'string', 'max:8'],
            'drops.*.net_downlink' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'drops.*.net_rtt' => ['nullable', 'integer', 'min:0'],
            'drops.*.save_data' => ['nullable', 'boolean'],
            'drops.*.buffered_bytes' => ['nullable', 'integer', 'min:0'],
            'drops.*.peak_buffered_bytes' => ['nullable', 'integer', 'min:0'],
            'drops.*.wake_lock' => ['nullable', 'boolean'],
            'drops.*.standalone' => ['nullable', 'boolean'],
            'drops.*.bitrate' => ['nullable', 'integer', 'min:0', 'max:320'],
            'drops.*.uplink_kbps' => ['nullable', 'integer', 'min:0'],
        ]);

        $recorded = 0;

        foreach ($validated['drops'] as $drop) {
            // add() is atomic: only the first delivery of an id gets through.
            if (! Cache::add('studio-drop:'.$station->getKey().':'.$drop['id'], 1, self::DEDUPE_SECONDS)) {
                continue;
            }

            $properties = [];
            foreach (self::FIELDS as $field) {
                if (array_key_exists($field, $drop) && $drop[$field] !== null) {
                    $properties[$field] = $drop[$field];
                }
            }

            StationEvent::record(
                $station,
                StationEvent::TYPE_STUDIO_DROP,
                StationEvent::SOURCE_OWNER,
                $properties,
                $request->user(),
            );
            $recorded++;
        }

        return response()->json(['recorded' => $recorded]);
    }
}
