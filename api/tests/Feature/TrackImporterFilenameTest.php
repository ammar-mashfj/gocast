<?php

use App\Services\TrackImporter;

it('splits "Artist - Title.mp3" filenames into separate fields', function () {
    $importer = app(TrackImporter::class);
    $method = (new ReflectionClass($importer))->getMethod('splitArtistTitle');
    $method->setAccessible(true);

    [$artist, $title] = $method->invoke($importer, 'EMIN feat. JONY - КАМИН.mp3');

    expect($artist)->toBe('EMIN feat. JONY');
    expect($title)->toBe('КАМИН');
});

it('returns nulls when the filename has multiple " - " separators', function () {
    $importer = app(TrackImporter::class);
    $method = (new ReflectionClass($importer))->getMethod('splitArtistTitle');
    $method->setAccessible(true);

    // Filenames like "شبابيك - إياد - Shababeek - Iyad.mp3" are ambiguous;
    // we deliberately don't guess. Caller falls back to title-only.
    [$artist, $title] = $method->invoke($importer, 'a - b - c.mp3');

    expect($artist)->toBeNull();
    expect($title)->toBeNull();
});

it('returns nulls when the filename has no " - " separator', function () {
    $importer = app(TrackImporter::class);
    $method = (new ReflectionClass($importer))->getMethod('splitArtistTitle');
    $method->setAccessible(true);

    [$artist, $title] = $method->invoke($importer, 'untitled.mp3');

    expect($artist)->toBeNull();
    expect($title)->toBeNull();
});
