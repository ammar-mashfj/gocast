<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTrackRequest;
use App\Http\Resources\TrackResource;
use App\Models\Station;
use App\Models\Track;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

/**
 * CRUD for audio tracks in a station's library.
 */
class TrackController extends Controller
{
    use AuthorizesRequests;

    public function index(Station $station): AnonymousResourceCollection
    {
        $this->authorize('view', $station);

        return TrackResource::collection($station->tracks);
    }

    public function store(StoreTrackRequest $request, Station $station): JsonResponse
    {
        $file = $request->file('file');
        $relativePath = $station->id.'/'.$file->hashName();

        $file->storeAs('tracks/'.$station->id, $file->hashName(), 'local');

        $fullPath = storage_path('app/tracks/'.$relativePath);
        $metadata = $this->extractMetadata($fullPath);

        $nextOrder = ($station->tracks()->max('sort_order') ?? -1) + 1;

        $track = $station->tracks()->create([
            'title' => $request->input('title') ?? $metadata['title'] ?? pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'artist' => $request->input('artist') ?? $metadata['artist'] ?? 'Unknown',
            'duration' => $metadata['duration'] ?? 0,
            'file_path' => $relativePath,
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'sort_order' => $nextOrder,
        ]);

        return (new TrackResource($track))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Station $station, Track $track): JsonResponse
    {
        $this->authorize('view', $station);

        Storage::disk('local')->delete('tracks/'.$track->file_path);
        $track->delete();

        return response()->json(['message' => 'Track deleted.']);
    }

    public function reorder(Request $request, Station $station): JsonResponse
    {
        $this->authorize('update', $station);

        $request->validate([
            'track_ids' => ['required', 'array'],
            'track_ids.*' => ['required', 'string'],
        ]);

        foreach ($request->input('track_ids') as $index => $trackId) {
            $station->tracks()->where('id', $trackId)->update(['sort_order' => $index]);
        }

        return response()->json(['message' => 'Queue reordered.']);
    }

    /**
     * Extract duration, title, and artist from an audio file via ffprobe.
     *
     * @return array{duration: float|null, title: string|null, artist: string|null}
     */
    private function extractMetadata(string $path): array
    {
        $result = Process::timeout(10)->run([
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            $path,
        ]);

        if (! $result->successful()) {
            return ['duration' => null, 'title' => null, 'artist' => null];
        }

        $data = json_decode($result->output(), true);
        $format = $data['format'] ?? [];
        $tags = $format['tags'] ?? [];

        return [
            'duration' => isset($format['duration']) ? (float) $format['duration'] : null,
            'title' => $tags['title'] ?? $tags['TITLE'] ?? null,
            'artist' => $tags['artist'] ?? $tags['ARTIST'] ?? $tags['album_artist'] ?? null,
        ];
    }
}
