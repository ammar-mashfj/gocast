<?php

use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\PlaylistFileWriter;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tmpDir = sys_get_temp_dir().'/gocast-playlist-test-'.uniqid();
    config(['liquidsoap.playlists_dir' => $this->tmpDir]);
});

afterEach(function () {
    if (isset($this->tmpDir) && is_dir($this->tmpDir)) {
        File::deleteDirectory($this->tmpDir);
    }
});

/**
 * A track for annotateTrack() to render. Nothing is written to disk any more,
 * so the URI is the whole contract here.
 */
function playlistTrack(array $attributes = []): Track
{
    $station = Station::factory()->for(User::factory(), 'user')->create();

    return Track::factory()->for($station)->create(array_merge([
        'path' => '01abc.mp3',
        'original_filename' => 'Song.mp3',
        'title' => 'T',
        'artist' => null,
        'duration_seconds' => 100,
        'file_size_bytes' => 1024,
        'position' => 1,
    ], $attributes));
}

it('builds annotate URIs with title and artist when both are set', function () {
    $track = playlistTrack([
        'title' => 'КАМИН',
        'artist' => 'EMIN feat. JONY',
        'duration_seconds' => 185,
    ]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toBe('annotate:duration="185.000",title="КАМИН",artist="EMIN feat. JONY":/data/playlists/01abc.mp3');
});

it('annotates the duration so the crossfade can time transitions', function () {
    // cross() needs to know where a track ends. We already store the length,
    // so there is no reason to make Liquidsoap infer it per playback —
    // AzuraCast annotates it for the same reason.
    //
    // Fixed 3 decimals: a plain float cast can emit scientific notation
    // ("1.8473799301908E+2"), which Liquidsoap's annotate parser rejects.
    $track = playlistTrack(['duration_seconds' => 184.73799301908]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toContain('duration="184.738"')
        ->not->toContain('E+');
});

it('omits the duration when it is unknown rather than sending zero', function () {
    // duration_seconds is NOT NULL with `default(0)`, so 0 — not null — is how
    // an unknown length actually reaches us. Emitting duration="0.000" would
    // tell Liquidsoap the track is zero-length.
    $track = playlistTrack(['path' => '01nodur.mp3', 'duration_seconds' => 0]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toBe('annotate:title="T":/data/playlists/01nodur.mp3');
});

it('omits the artist key when no artist is set', function () {
    $track = playlistTrack([
        'path' => '01xyz.mp3',
        'title' => 'شبابيك - إياد',
        'artist' => null,
        'duration_seconds' => 193,
    ]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toBe('annotate:duration="193.000",title="شبابيك - إياد":/data/playlists/01xyz.mp3');
});

it('escapes double quotes inside titles', function () {
    $track = playlistTrack(['path' => '01q.mp3', 'title' => 'She said "hi"']);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))
        ->toContain('title="She said \\"hi\\""');
});

it('creates the station directory and writes no playlist file into it', function () {
    // Songs and jingles are both served one track at a time by
    // NextTrackController. A file here would be dead weight at best, and at
    // worst something a future .liq is tempted to read — reintroducing the
    // reload-resets-to-track-one bug that moved the rotation off a playlist.
    $station = Station::factory()->for(User::factory(), 'user')->create(['slug' => 'no-files']);

    app(PlaylistFileWriter::class)->ensureDirectory($station);

    expect(File::isDirectory($this->tmpDir.'/no-files'))->toBeTrue()
        ->and(File::files($this->tmpDir.'/no-files'))->toBe([]);
});

it('flags a jingle so the audio graph can recognise it downstream', function () {
    // The .liq reads this annotation in two places — the crossfade (hard cut,
    // never a mix) and the now-playing push (a station ID is not "now
    // playing"). Both run long after the request left its source, so the flag
    // has to travel on the request itself.
    $track = playlistTrack(['path' => '01id.mp3', 'title' => 'Top of the hour', 'duration_seconds' => 8, 'kind' => Track::KIND_JINGLE]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track, isJingle: true))
        ->toBe('annotate:jingle="true",duration="8.000",title="Top of the hour":/data/playlists/01id.mp3');
});

it('never flags a rotation entry as a jingle', function () {
    // A stray flag on a music track would hard cut every transition and blank
    // now-playing for the whole station.
    $track = playlistTrack(['path' => '01song.mp3', 'title' => 'A Song']);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track))->not->toContain('jingle=');
});

it('cuts a song short with a fade when told how long to play it', function () {
    // The planner's way of starting something on time: cue-out after that
    // many seconds of airtime, and a fade into it rather than a hard stop.
    $track = playlistTrack(['duration_seconds' => 240, 'cue_in_seconds' => 1.5]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track, playFor: 42.25))
        ->toContain('liq_cue_in="1.500"')
        ->toContain('liq_cue_out="43.750"')
        ->toContain('liq_fade_out="2.000"');
});

it('never fades longer than the cut itself', function () {
    $track = playlistTrack(['duration_seconds' => 240]);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track, playFor: 1.2))
        ->toContain('liq_cue_out="1.200"')
        ->toContain('liq_fade_out="1.200"');
});

it('names the playlist a rotation track came from', function () {
    // Not read by the script; it rides along in on_metadata so now-playing
    // and the timeline can say where a track came from once the schedule
    // switches playlists by time of day.
    $track = playlistTrack(['title' => 'T']);

    expect(app(PlaylistFileWriter::class)->annotateTrack($track, playlist: 'Morning "Calm"'))
        ->toBe('annotate:duration="100.000",title="T",playlist="Morning \"Calm\"":/data/playlists/01abc.mp3');
});
