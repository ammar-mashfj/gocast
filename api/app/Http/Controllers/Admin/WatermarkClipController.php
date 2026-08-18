<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreWatermarkClipRequest;
use App\Jobs\ReloadWatermarkClips;
use App\Models\Station;
use App\Services\WatermarkClipLibrary;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Manages the free-tier watermark clips — the platform's own audio, mixed over
 * every station whose owner is on a watermarked plan.
 *
 * Only the CLIPS are editable here. How loud, how often, and whether the
 * feature runs at all are install settings in config/liquidsoap.php, and which
 * stations are affected is a plan column: both are shown read-only so the
 * operator can see what a clip will actually do before uploading one.
 */
class WatermarkClipController extends Controller
{
    public function __construct(private readonly WatermarkClipLibrary $library) {}

    public function index(): View
    {
        return view('admin.watermark', [
            'clips' => $this->library->all(),
            'directory' => $this->library->directory(),
            'writable' => $this->library->writable(),
            'totalBytes' => $this->library->totalBytes(),
            'globalEnabled' => (bool) config('liquidsoap.watermark_enabled'),
            'interval' => (float) config('liquidsoap.watermark_interval_seconds'),
            'duck' => (float) config('liquidsoap.watermark_duck'),
            'fade' => (float) config('liquidsoap.watermark_fade_seconds'),
            'maxBytes' => (int) config('liquidsoap.watermark_clip_max_bytes'),
            'markedStations' => $this->markedStations()->count(),
            'markedOnAir' => $this->markedStations()->running()->count(),
        ]);
    }

    public function store(StoreWatermarkClipRequest $request): RedirectResponse
    {
        $name = $this->library->store($request->file('clip'));

        ReloadWatermarkClips::dispatch();

        return to_route('admin.watermark.index')
            ->with('status', "Added {$name}. Running stations will pick it up shortly.");
    }

    public function destroy(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $deleted = $this->library->delete($validated['name']);

        if (! $deleted) {
            return to_route('admin.watermark.index')
                ->with('error', 'That clip is no longer there.');
        }

        ReloadWatermarkClips::dispatch();

        return to_route('admin.watermark.index')
            ->with('status', "Removed {$validated['name']}. Running stations will drop it shortly.");
    }

    /**
     * Stations that actually carry the watermark: the plan flag decides it,
     * never the station — see the add_watermark_to_plans_table migration.
     *
     * @return Builder<Station>
     */
    private function markedStations()
    {
        return Station::query()->whereHas(
            'user.plan',
            fn ($plan) => $plan->where('watermark_enabled', true),
        );
    }
}
