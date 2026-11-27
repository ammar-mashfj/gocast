<?php

use App\Models\Plan;
use App\Models\Spotlight;
use App\Models\User;
use Illuminate\Support\Facades\DB;

use function Pest\Laravel\actingAs;

/**
 * /api/spotlights: who sees which dialog is decided on every read, and the
 * account's minimise / close survives reloads.
 */
function freeUser(): User
{
    return User::factory()->create(['plan_id' => Plan::where('slug', 'free')->value('id')]);
}

function proUser(): User
{
    return User::factory()->create(['plan_id' => Plan::where('slug', 'pro')->value('id')]);
}

it('sends a running spotlight as new, with its body rendered', function () {
    Spotlight::factory()->create(['key' => 'launch', 'body' => "**Big** news\n\n<script>x</script>"]);

    $response = actingAs(freeUser())->getJson('/api/spotlights')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.key'))->toBe('launch')
        ->and($response->json('data.0.state'))->toBe('new')
        ->and($response->json('data.0.preview'))->toBeFalse()
        ->and($response->json('data.0.body_html'))->toContain('<strong>Big</strong>')
        ->and($response->json('data.0.body_html'))->not->toContain('<script>')
        ->and($response->json('data.0.image_url'))->toBeNull();
});

it('sends the chip text, falling back to the title', function () {
    Spotlight::factory()->create(['key' => 'short', 'title' => 'Black Friday: a year of Pro for $99', 'chip_label' => 'Black Friday: $99', 'priority' => 1]);
    Spotlight::factory()->create(['key' => 'plain', 'title' => 'Playlists have colours']);

    $labels = collect(actingAs(freeUser())->getJson('/api/spotlights')->json('data'))->pluck('chip_label', 'key')->all();

    expect($labels)->toBe(['short' => 'Black Friday: $99', 'plain' => 'Playlists have colours']);
});

it('sends the uploaded image as a public URL', function () {
    Spotlight::factory()->create(['image_path' => 'uploads/spotlights/bf.png']);

    expect(actingAs(freeUser())->getJson('/api/spotlights')->json('data.0.image_url'))
        ->toEndWith('/storage/uploads/spotlights/bf.png');
});

it('targets free and paid accounts by their plan at read time', function () {
    Spotlight::factory()->offer()->create(['key' => 'bf']);
    Spotlight::factory()->create(['key' => 'pro-news', 'audience' => 'pro']);

    expect(actingAs(freeUser())->getJson('/api/spotlights')->json('data.*.key'))->toBe(['bf']);
    expect(actingAs(proUser())->getJson('/api/spotlights')->json('data.*.key'))->toBe(['pro-news']);
});

it('drops an offer the moment the account upgrades', function () {
    Spotlight::factory()->offer()->create(['key' => 'bf']);
    $user = freeUser();

    expect(actingAs($user)->getJson('/api/spotlights')->json('data'))->toHaveCount(1);

    $user->update(['plan_id' => Plan::where('slug', 'pro')->value('id')]);

    expect(actingAs($user->fresh())->getJson('/api/spotlights')->json('data'))->toBeEmpty();
});

it('hides spotlights that are off, not started, or ended', function () {
    Spotlight::factory()->inactive()->create();
    Spotlight::factory()->create(['starts_at' => now()->addDay()]);
    Spotlight::factory()->create(['ends_at' => now()->subMinute()]);

    expect(actingAs(freeUser())->getJson('/api/spotlights')->json('data'))->toBeEmpty();
});

it('orders by priority', function () {
    Spotlight::factory()->create(['key' => 'low', 'priority' => 0]);
    Spotlight::factory()->create(['key' => 'high', 'priority' => 10]);

    expect(actingAs(freeUser())->getJson('/api/spotlights')->json('data.*.key'))->toBe(['high', 'low']);
});

it('keeps a closed spotlight as a chip, never dropping it', function () {
    Spotlight::factory()->create(['key' => 'a']);
    Spotlight::factory()->create(['key' => 'b']);
    $user = freeUser();
    actingAs($user);

    $this->postJson('/api/spotlights/a/minimize')->assertNoContent();

    $data = collect($this->getJson('/api/spotlights')->json('data'))->pluck('state', 'key')->all();
    expect($data)->toBe(['b' => 'new', 'a' => 'minimized']);

    $this->postJson('/api/spotlights/a/dismiss')->assertNotFound();
});

it('keeps the first time of each action', function () {
    $spotlight = Spotlight::factory()->create(['key' => 'a']);
    $user = freeUser();
    actingAs($user);

    $this->travelTo(now()->subHour());
    $this->postJson('/api/spotlights/a/click')->assertNoContent();
    $first = DB::table('spotlight_user')->value('clicked_at');
    $this->travelBack();

    $this->postJson('/api/spotlights/a/click')->assertNoContent();
    $this->postJson('/api/spotlights/a/seen')->assertNoContent();

    $row = DB::table('spotlight_user')->where('spotlight_id', $spotlight->id)->where('user_id', $user->id)->first();
    expect(DB::table('spotlight_user')->count())->toBe(1)
        ->and($row->clicked_at)->toBe($first)
        ->and($row->seen_at)->not->toBeNull();
});

it('refuses actions on spotlights the account cannot see, and unknown actions', function () {
    Spotlight::factory()->create(['key' => 'paid-only', 'audience' => 'pro']);
    Spotlight::factory()->create(['key' => 'open']);
    actingAs(freeUser());

    $this->postJson('/api/spotlights/paid-only/minimize')->assertNotFound();
    $this->postJson('/api/spotlights/nope/minimize')->assertNotFound();
    $this->postJson('/api/spotlights/open/delete')->assertNotFound();

    expect(DB::table('spotlight_user')->count())->toBe(0);
});

it('shows a draft to the test list only, marked as a preview', function () {
    Spotlight::factory()->inactive()->create(['key' => 'draft', 'audience' => 'pro', 'preview_emails' => "Tester@Example.com\nother@example.com"]);
    $tester = User::factory()->create(['email' => 'tester@example.com', 'plan_id' => Plan::where('slug', 'free')->value('id')]);

    expect(actingAs(freeUser())->getJson('/api/spotlights')->json('data'))->toBeEmpty();

    $data = actingAs($tester)->getJson('/api/spotlights')->json('data');
    expect($data)->toHaveCount(1)->and($data[0]['preview'])->toBeTrue();

    $this->postJson('/api/spotlights/draft/seen')->assertNoContent();
});

it('needs a signed-in account', function () {
    $this->getJson('/api/spotlights')->assertUnauthorized();
});
