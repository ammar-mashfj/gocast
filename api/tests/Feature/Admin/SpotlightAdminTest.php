<?php

use App\Models\Admin;
use App\Models\Spotlight;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * /admin/spotlights: create, edit in place, and reset for the test list.
 */
beforeEach(function () {
    test()->actingAs(Admin::factory()->create(), 'admin');
});

it('lists spotlights with their counts', function () {
    $spotlight = Spotlight::factory()->create(['title' => 'Black Friday']);
    DB::table('spotlight_user')->insert([
        'spotlight_id' => $spotlight->id,
        'user_id' => User::factory()->create()->id,
        'seen_at' => now(),
        'clicked_at' => now(),
    ]);

    $this->get(route('admin.spotlights.index'))
        ->assertOk()
        ->assertSee('Black Friday')
        ->assertSee('1 · 0 · 1');
});

it('creates a spotlight, keying it from the title when the key is blank', function () {
    $this->post(route('admin.spotlights.store'), [
        'kind' => 'offer',
        'title' => 'Black Friday: Pro for less',
        'chip_label' => 'Black Friday: $99',
        'body' => 'Until Monday.',
        'cta_label' => 'Get Pro',
        'cta_url' => '/dashboard/settings?coupon=BF2026',
        'audience' => 'free',
        'ends_at' => now()->addDays(3)->format('Y-m-d\TH:i'),
        'active' => '1',
    ])->assertRedirect(route('admin.spotlights.index'));

    $spotlight = Spotlight::sole();
    expect($spotlight->key)->toBe(now()->format('Y-m').'-black-friday-pro-for-less')
        ->and($spotlight->active)->toBeTrue()
        ->and($spotlight->audience)->toBe('free')
        ->and($spotlight->chip_label)->toBe('Black Friday: $99');
});

it('rejects a link with no label, a bad url, bad test emails, and an end before the start', function () {
    $this->post(route('admin.spotlights.store'), [
        'kind' => 'feature',
        'title' => 'x',
        'cta_url' => 'javascript:alert(1)',
        'audience' => 'all',
        'preview_emails' => 'not-an-email',
        'starts_at' => '2026-12-02T00:00',
        'ends_at' => '2026-12-01T00:00',
    ])->assertSessionHasErrors(['cta_url', 'cta_label']);

    $this->post(route('admin.spotlights.store'), [
        'kind' => 'feature',
        'title' => 'x',
        'audience' => 'all',
        'preview_emails' => 'not-an-email',
        'starts_at' => '2026-12-02T00:00',
        'ends_at' => '2026-12-01T00:00',
    ])->assertSessionHasErrors(['ends_at', 'preview_emails']);

    expect(Spotlight::count())->toBe(0);
});

it('switches a spotlight off from the edit form', function () {
    $spotlight = Spotlight::factory()->create();

    $this->post(route('admin.spotlights.update', $spotlight), [
        'key' => $spotlight->key,
        'kind' => $spotlight->kind,
        'title' => $spotlight->title,
        'audience' => 'all',
        'active' => '0',
    ])->assertRedirect(route('admin.spotlights.index'));

    expect($spotlight->fresh()->active)->toBeFalse();
});

it('resets only the test list', function () {
    $tester = User::factory()->create(['email' => 'me@example.com']);
    $other = User::factory()->create();
    $spotlight = Spotlight::factory()->create(['preview_emails' => 'ME@example.com']);
    foreach ([$tester, $other] as $user) {
        DB::table('spotlight_user')->insert(['spotlight_id' => $spotlight->id, 'user_id' => $user->id, 'minimized_at' => now()]);
    }

    $this->post(route('admin.spotlights.reset-preview', $spotlight))->assertRedirect(route('admin.spotlights.index'));

    expect(DB::table('spotlight_user')->pluck('user_id')->all())->toBe([$other->id]);
});

/**
 * @return array<string, mixed>
 */
function spotlightFields(array $overrides = []): array
{
    return [
        'kind' => 'offer',
        'title' => 'Black Friday',
        'audience' => 'free',
        'active' => '1',
        ...$overrides,
    ];
}

it('stores an uploaded image and serves it from public storage', function () {
    Storage::fake('public');

    $this->post(route('admin.spotlights.store'), spotlightFields([
        'image' => UploadedFile::fake()->image('bf.png', 1200, 600),
    ]))->assertRedirect(route('admin.spotlights.index'));

    $spotlight = Spotlight::sole();
    expect($spotlight->image_path)->toStartWith(Spotlight::IMAGE_DIRECTORY.'/');
    Storage::disk('public')->assertExists($spotlight->image_path);
    expect($spotlight->imageUrl())->toBe(Storage::disk('public')->url($spotlight->image_path));
});

it('replaces the image, deleting the old file, and keeps it when nothing is chosen', function () {
    Storage::fake('public');
    $old = UploadedFile::fake()->image('old.png')->store(Spotlight::IMAGE_DIRECTORY, 'public');
    $spotlight = Spotlight::factory()->create(['image_path' => $old]);
    $fields = spotlightFields(['key' => $spotlight->key]);

    $this->post(route('admin.spotlights.update', $spotlight), $fields);
    expect($spotlight->fresh()->image_path)->toBe($old);

    $this->post(route('admin.spotlights.update', $spotlight), [...$fields, 'image' => UploadedFile::fake()->image('new.webp')]);
    $new = $spotlight->fresh()->image_path;
    expect($new)->not->toBe($old);
    Storage::disk('public')->assertMissing($old);
    Storage::disk('public')->assertExists($new);
});

it('removes the image when asked', function () {
    Storage::fake('public');
    $path = UploadedFile::fake()->image('bf.png')->store(Spotlight::IMAGE_DIRECTORY, 'public');
    $spotlight = Spotlight::factory()->create(['image_path' => $path]);

    $this->post(route('admin.spotlights.update', $spotlight), spotlightFields(['key' => $spotlight->key, 'remove_image' => '1']));

    expect($spotlight->fresh()->image_path)->toBeNull();
    Storage::disk('public')->assertMissing($path);
});

it('refuses SVGs, non-images and files over 2 MB', function () {
    Storage::fake('public');

    foreach ([
        UploadedFile::fake()->create('x.svg', 10, 'image/svg+xml'),
        UploadedFile::fake()->create('x.pdf', 10, 'application/pdf'),
        UploadedFile::fake()->image('big.png')->size(3000),
    ] as $file) {
        $this->post(route('admin.spotlights.store'), spotlightFields(['image' => $file]))->assertSessionHasErrors('image');
    }

    expect(Spotlight::count())->toBe(0);
});
