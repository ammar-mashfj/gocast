<?php

use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use App\Services\LiquidsoapString;
use App\Services\LiquidsoapSupervisor;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;

/**
 * 2026-11-02: a station named with a Liquidsoap `#{...}` interpolation ran
 * shell commands inside its container, because the name was rendered into the
 * .liq as a string literal and Liquidsoap evaluates `#{` inside those. The
 * owner's text now goes to a JSON sidecar the script parses as data; every
 * other string in the script goes through LiquidsoapString.
 */
const LIQ_PAYLOAD = "#{process.run('echo cHJpbnRmICJEQkcxMDI0XG4iOyBpZA==|base64 -d|sh')}";

function renderLiqFor(Station $station): string
{
    $method = new ReflectionMethod(LiquidsoapSupervisor::class, 'renderLiq');

    return $method->invoke(app(LiquidsoapSupervisor::class), $station);
}

beforeEach(function () {
    Plan::updateOrCreate(['id' => 1], ['name' => 'Free', 'slug' => 'free', 'max_stations' => 10, 'max_listeners' => 100]);
});

it('keeps the exploited payload out of the rendered script entirely', function () {
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'slug' => 'pwned',
        'name' => LIQ_PAYLOAD,
        'description' => LIQ_PAYLOAD,
        'genre' => LIQ_PAYLOAD,
        'icecast_mount' => '/stream/pwned',
    ]);

    $script = renderLiqFor($station);

    expect($script)->not->toContain(LIQ_PAYLOAD)
        ->and($script)->not->toContain('cHJpbnRm')
        ->and($script)->toContain('name = station_meta.name')
        ->and($script)->toContain('description = station_meta.description')
        ->and($script)->toContain('genre = station_meta.genre')
        ->and($script)->toContain('file.contents("\/station-meta.json")');
});

it('hands the owner text to the script as json data instead', function () {
    $station = Station::factory()->for(User::factory(), 'user')->make([
        'name' => LIQ_PAYLOAD,
        'description' => null,
        'genre' => 'Jazz 🎷 "quoted"',
    ]);

    $meta = app(LiquidsoapSupervisor::class)->renderStationMeta($station);

    expect(json_decode($meta, true, flags: JSON_THROW_ON_ERROR))->toBe([
        'name' => LIQ_PAYLOAD,
        'description' => '',
        'genre' => 'Jazz 🎷 "quoted"',
    ])
        // Raw UTF-8: Liquidsoap's JSON parser mangles \u surrogate pairs.
        ->and($meta)->toContain('🎷');
});

it('mounts the sidecar read-only next to the script', function () {
    $station = Station::factory()->for(User::factory(), 'user')->make(['slug' => 'side']);
    $mounts = (new ReflectionMethod(LiquidsoapSupervisor::class, 'mountFlags'))
        ->invoke(app(LiquidsoapSupervisor::class), $station);

    expect(implode(' ', $mounts))->toContain('/side.json:/station-meta.json:ro');
});

it('writes every # in a liquidsoap literal as \x23 so nothing can interpolate', function () {
    expect(LiquidsoapString::literal(LIQ_PAYLOAD))
        ->toBe('"\x23{process.run(\'echo cHJpbnRmICJEQkcxMDI0XG4iOyBpZA==|base64 -d|sh\')}"')
        ->and(LiquidsoapString::literal('a "b" \\ #{c}'))->toBe('"a \"b\" \\\\ \x23{c}"')
        // A backslash in front of the # cannot turn \x23 back into an escape:
        // json_encode doubles it first.
        ->and(LiquidsoapString::literal('\\#{x}'))->toBe('"\\\\\x23{x}"')
        ->and(LiquidsoapString::literal(null))->toBe('null');
});

it('escapes operator config strings in the script too', function () {
    config(['liquidsoap.live_broadcast_text' => "#{process.run('id')}"]);
    $station = Station::factory()->for(User::factory(), 'user')->make(['slug' => 'cfg']);

    expect(renderLiqFor($station))
        ->toContain('[("title", "\x23{process.run(\'id\')}")]')
        ->not->toContain("#{process.run('id')}");
});

it('never json_encodes straight into the template', function () {
    $source = file_get_contents(resource_path('views/liquidsoap/station.blade.php'));

    expect($source)->not->toMatch('/\{!!\s*json_encode/')
        ->and($source)->not->toContain('@json(');
});

it('refuses #{ in station text on create', function (string $field) {
    Sanctum::actingAs(User::factory()->create(['plan_id' => 1]));

    $this->postJson('/api/stations', ['name' => 'Fine', $field => LIQ_PAYLOAD])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    expect(Station::count())->toBe(0);
})->with(['name', 'description', 'genre']);

it('refuses #{ in station text on update', function (string $field) {
    $owner = User::factory()->create(['plan_id' => 1]);
    $station = Station::factory()->for($owner)->create(['name' => 'Fine']);

    $this->actingAs($owner)
        ->patchJson("/api/stations/{$station->slug}", [$field => 'x #{y} z'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with(['name', 'description', 'genre']);

it('still accepts a lone # or { in station text', function () {
    $owner = User::factory()->create(['plan_id' => 1]);
    $station = Station::factory()->for($owner)->create(['name' => 'Fine']);

    $this->actingAs($owner)
        ->patchJson("/api/stations/{$station->slug}", ['name' => '#1 Hits {live}', 'genre' => 'C# & {jazz}'])
        ->assertOk();

    expect($station->fresh()->name)->toBe('#1 Hits {live}');
});

it('lists stations carrying the payload without changing them', function () {
    $owner = User::factory()->create(['plan_id' => 1, 'email' => 'attacker@example.com']);
    $bad = Station::factory()->for($owner)->create(['name' => 'Clean', 'genre' => LIQ_PAYLOAD]);
    $trashed = Station::factory()->for($owner)->create(['name' => 'Gone', 'description' => 'x #{y}']);
    $trashed->delete();
    Station::factory()->for($owner)->create(['name' => 'Innocent #1 {hits}']);
    $before = Station::withTrashed()->orderBy('id')->get()->toArray();

    expect(Artisan::call('stations:find-liq-injection'))->toBe(0);
    $output = Artisan::output();

    expect($output)->toContain($bad->slug)
        ->toContain($trashed->slug)
        ->toContain('trashed')
        ->toContain('attacker@example.com')
        ->toContain('2 station(s) found')
        ->not->toContain('innocent')
        ->and(Station::withTrashed()->orderBy('id')->get()->toArray())->toBe($before);
});

it('says so when no station carries the payload', function () {
    $this->artisan('stations:find-liq-injection')
        ->expectsOutputToContain('No station text contains')
        ->assertSuccessful();
});
