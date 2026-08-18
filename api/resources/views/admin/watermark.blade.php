@extends('admin.layout')

@section('title', 'Watermark clips')

@section('content')
    @if (! $globalEnabled)
        <div role="alert" class="alert alert-warning alert-soft mb-6">
            <span>
                Watermarking is switched off for this install
                (<code>LIQUIDSOAP_WATERMARK_ENABLED</code>). Clips are still managed here,
                but nothing plays them and the source is not built into station scripts.
            </span>
        </div>
    @elseif ($clips->isEmpty())
        <div role="alert" class="alert alert-warning alert-soft mb-6">
            <span>
                No clips in the directory, so <strong>{{ $markedStations }}</strong>
                {{ Str::plural('station', $markedStations) }} on a watermarked plan are
                currently broadcasting unmarked. Stations still run normally — an empty
                directory is designed never to take anything off air.
            </span>
        </div>
    @endif

    @if (! $writable)
        <div role="alert" class="alert alert-error alert-soft mb-6">
            <span><code>{{ $directory }}</code> is not writable by the API process — uploads will fail.</span>
        </div>
    @endif

    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 class="card-title">Clips</h2>
                        <span class="text-sm opacity-60">
                            {{ $clips->count() }} {{ Str::plural('file', $clips->count()) }} ·
                            {{ \Illuminate\Support\Number::fileSize($totalBytes) }}
                        </span>
                    </div>

                    <p class="text-sm opacity-70">
                        Liquidsoap plays these at random, one per watermark. Add more than one
                        and they rotate.
                    </p>

                    <div class="overflow-x-auto">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Length</th>
                                    <th>Size</th>
                                    <th>Added</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse ($clips as $clip)
                                    <tr class="hover:bg-base-200">
                                        <td class="font-mono text-sm">{{ $clip['name'] }}</td>
                                        <td class="tabular-nums">
                                            @if ($clip['duration'])
                                                {{ sprintf('%d:%02d', intdiv((int) $clip['duration'], 60), (int) $clip['duration'] % 60) }}
                                            @else
                                                <span class="opacity-40">—</span>
                                            @endif
                                        </td>
                                        <td class="tabular-nums">{{ \Illuminate\Support\Number::fileSize($clip['bytes']) }}</td>
                                        <td class="text-sm opacity-70">{{ $clip['modified_at']->diffForHumans() }}</td>
                                        <td class="text-right">
                                            <form method="POST" action="{{ route('admin.watermark.destroy') }}"
                                                  onsubmit="return confirm('Remove {{ $clip['name'] }} from every station?')">
                                                @csrf
                                                @method('DELETE')
                                                <input type="hidden" name="name" value="{{ $clip['name'] }}">
                                                <button type="submit" class="btn btn-ghost btn-xs text-error">Remove</button>
                                            </form>
                                        </td>
                                    </tr>
                                @empty
                                    <tr>
                                        <td colspan="5" class="py-10 text-center opacity-60">
                                            No clips yet.
                                        </td>
                                    </tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>

                    <form method="POST" action="{{ route('admin.watermark.store') }}"
                          enctype="multipart/form-data"
                          class="flex flex-wrap items-end gap-3 border-t border-base-300 pt-4">
                        @csrf
                        <fieldset class="fieldset flex-1">
                            <legend class="fieldset-legend">Add a clip</legend>
                            <input type="file" name="clip" required
                                   accept="{{ collect(\App\Services\WatermarkClipLibrary::ALLOWED_EXTENSIONS)->map(fn ($e) => '.'.$e)->implode(',') }}"
                                   class="file-input w-full @error('clip') file-input-error @enderror">
                            <p class="label">
                                Up to {{ \Illuminate\Support\Number::fileSize($maxBytes) }} ·
                                {{ implode(', ', \App\Services\WatermarkClipLibrary::ALLOWED_EXTENSIONS) }}
                            </p>
                        </fieldset>
                        <button type="submit" class="btn btn-primary">Upload</button>
                    </form>

                    @error('clip')
                        <div role="alert" class="alert alert-error alert-soft text-sm">{{ $message }}</div>
                    @enderror
                </div>
            </div>
        </section>

        <aside class="space-y-6">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">How it plays</h2>

                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-70">Feature</span>
                        <span @class(['badge badge-sm', 'badge-success' => $globalEnabled, 'badge-ghost' => ! $globalEnabled])>
                            {{ $globalEnabled ? 'on' : 'off' }}
                        </span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-70">Every</span>
                        <span class="tabular-nums">{{ (int) $interval }}s</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-70">Station ducks to</span>
                        <span class="tabular-nums">{{ (int) round($duck * 100) }}%</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-70">Fade</span>
                        <span class="tabular-nums">{{ $fade }}s</span>
                    </div>

                    <p class="text-xs opacity-60">
                        Install settings, not station settings — change them in
                        <code>config/liquidsoap.php</code> or the environment. Stations pick
                        up interval and duck live; a fade change needs a restart.
                    </p>
                </div>
            </div>

            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">Who hears it</h2>

                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-70">Watermarked stations</span>
                        <span class="tabular-nums">{{ $markedStations }}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="opacity-70">…of those, on air</span>
                        <span class="tabular-nums">{{ $markedOnAir }}</span>
                    </div>

                    <p class="text-xs opacity-60">
                        Set by the owner's plan (<code>plans.watermark_enabled</code>), never by
                        the station. Upgrading is the only way it stops.
                    </p>
                </div>
            </div>

            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-2">
                    <h2 class="card-title text-base">Directory</h2>
                    <code class="text-xs break-all">{{ $directory }}</code>
                    <p class="text-xs opacity-60">
                        Mounted read-only into every station container at
                        <code>/data/system</code>. Files dropped in over SSH appear here too.
                    </p>
                </div>
            </div>
        </aside>
    </div>
@endsection
