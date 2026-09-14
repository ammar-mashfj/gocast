<?php

use App\Models\Station;
use App\Models\User;

use function Pest\Laravel\actingAs;

/**
 * The station's freeform link list.
 *
 * The rules under test are all about what reaches the JSON column, because
 * nothing downstream re-validates it: these rows are handed straight to the
 * public player page and rendered as anchors. What the column accepts today is
 * what a listener can be sent to years from now.
 */
it('saves an ordered list of links', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    $links = [
        ['label' => null, 'url' => 'https://instagram.com/jazzfm'],
        ['label' => 'Our shop', 'url' => 'https://jazzfm.example/shop'],
    ];

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", ['social_links' => $links])
        ->assertOk()
        // Order is the feature — the array's order is the row order on the
        // player, which is the only control the owner has over it.
        ->assertJsonPath('data.social_links', $links);

    // so a round-trip can come back url-then-label. Row order is the part
    // that carries meaning and == still holds the list to it.
    expect($station->fresh()->social_links)->toEqual($links);
});

it('lets the owner clear every link', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create([
        'social_links' => [['label' => null, 'url' => 'https://x.com/jazzfm']],
    ]);

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", ['social_links' => []])
        ->assertOk();

    expect($station->fresh()->social_links)->toBe([]);
});

/**
 * The reason the protocol allowlist is there rather than a bare `url` rule.
 * Laravel's default protocol list is the whole IANA registry, so all of these
 * pass `url` and would become live anchors on a public page.
 */
it('rejects protocols that are not http or https', function (string $url) {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", [
            'social_links' => [['label' => 'Tap me', 'url' => $url]],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('social_links.0.url');

    expect($station->fresh()->social_links)->toBeNull();
})->with([
    'file' => ['file://etc/passwd'],
    'data' => ['data://text/html,<script>alert(1)</script>'],
    'view-source' => ['view-source://evil.example'],
    'javascript' => ['javascript:alert(1)'],
    'no scheme at all' => ['instagram.com/jazzfm'],
]);

it('requires a url on every row', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", [
            'social_links' => [['label' => 'Nowhere', 'url' => '']],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('social_links.0.url');
});

/**
 * Without array:label,url any shape at all survives into the column and every
 * future read site inherits the job of defending against it.
 */
it('rejects rows carrying keys it does not know', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", [
            'social_links' => [[
                'label' => 'Mine',
                'url' => 'https://example.com',
                'onclick' => 'doSomething()',
            ]],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('social_links.0');
});

it('caps the list at the layout bound', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    $links = array_map(
        fn (int $i) => ['label' => "Link {$i}", 'url' => "https://example.com/{$i}"],
        range(1, Station::MAX_SOCIAL_LINKS + 1),
    );

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", ['social_links' => $links])
        ->assertStatus(422)
        ->assertJsonValidationErrors('social_links');
});

it('holds labels to a length the player can render', function () {
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner, 'user')->create();

    actingAs($owner, 'sanctum')
        ->putJson("/api/stations/{$station->slug}", [
            'social_links' => [['label' => str_repeat('a', 31), 'url' => 'https://example.com']],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('social_links.0.label');
});

/**
 * Links are free on every plan, and they are public: a listener who never
 * signs in is the whole audience for them.
 */
it('shows a station\'s links to anonymous visitors', function () {
    $links = [['label' => null, 'url' => 'https://bandcamp.com/jazzfm']];
    $station = Station::factory()->for(User::factory(), 'user')->create([
        'social_links' => $links,
    ]);

    // The owner's show endpoint is behind auth; this is the one the player
    // page actually calls, and it shares StationResource with it.
    $response = $this->getJson("/api/public/stations/{$station->slug}")->assertOk();

    // toEqual rather than assertJsonPath's identity: MySQL's JSON type sorts
    // each object's keys as it stores them, so a row written label-then-url
    // reads back url-then-label. Only the row ORDER survives storage, and the
    // row order is the only part that carries meaning.
    expect($response->json('data.social_links'))->toEqual($links);
});

it('will not let one owner write links onto another owner\'s station', function () {
    $station = Station::factory()->for(User::factory(), 'user')->create();

    actingAs(User::factory()->create(), 'sanctum')
        ->putJson("/api/stations/{$station->slug}", [
            'social_links' => [['label' => 'Mine now', 'url' => 'https://evil.example']],
        ])
        ->assertForbidden();

    expect($station->fresh()->social_links)->toBeNull();
});
