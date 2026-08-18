<?php

use App\Jobs\ReloadWatermarkClips;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    test()->withoutVite();
    test()->actingAs(Admin::factory()->create(), 'admin');

    // A real directory per test: the library's whole contract is "the disk is
    // the source of truth", so faking the filesystem would test nothing.
    $this->clipDir = storage_path('framework/testing/system-'.uniqid());
    File::ensureDirectoryExists($this->clipDir);
    config(['liquidsoap.system_dir' => $this->clipDir]);
});

afterEach(function () {
    File::deleteDirectory($this->clipDir);
});

it('lists the clips on disk', function () {
    File::put($this->clipDir.'/powered-by.mp3', 'audio');

    $this->get(route('admin.watermark.index'))
        ->assertOk()
        ->assertSee('powered-by.mp3');
});

it('ignores files liquidsoap cannot play', function () {
    File::put($this->clipDir.'/notes.txt', 'not audio');

    $this->get(route('admin.watermark.index'))
        ->assertOk()
        ->assertDontSee('notes.txt');
});

it('warns when marked stations are broadcasting unmarked', function () {
    $plan = Plan::factory()->create(['watermark_enabled' => true]);
    $user = User::factory()->create(['plan_id' => $plan->id]);
    Station::factory()->for($user)->create();

    $this->get(route('admin.watermark.index'))
        ->assertOk()
        ->assertSee('broadcasting unmarked');
});

it('stores an uploaded clip and asks running stations to reload', function () {
    Queue::fake();

    $this->post(route('admin.watermark.store'), [
        'clip' => UploadedFile::fake()->create('Powered By GoCast.mp3', 64, 'audio/mpeg'),
    ])->assertRedirect(route('admin.watermark.index'));

    // Name is rebuilt from a slug rather than trusted.
    expect(File::files($this->clipDir))->toHaveCount(1)
        ->and(basename(File::files($this->clipDir)[0]))->toBe('powered-by-gocast.mp3');

    Queue::assertPushed(ReloadWatermarkClips::class);
});

it('never overwrites an existing clip', function () {
    Queue::fake();

    foreach (range(1, 2) as $ignored) {
        $this->post(route('admin.watermark.store'), [
            'clip' => UploadedFile::fake()->create('promo.mp3', 16, 'audio/mpeg'),
        ]);
    }

    expect(collect(File::files($this->clipDir))->map(fn ($f) => $f->getFilename())->sort()->values()->all())
        ->toBe(['promo-2.mp3', 'promo.mp3']);
});

it('rejects a file that is not audio', function () {
    Queue::fake();

    $this->post(route('admin.watermark.store'), [
        'clip' => UploadedFile::fake()->create('payload.php', 4, 'text/x-php'),
    ])->assertSessionHasErrors('clip');

    expect(File::files($this->clipDir))->toBeEmpty();
    Queue::assertNothingPushed();
});

it('deletes a clip and asks running stations to reload', function () {
    Queue::fake();
    File::put($this->clipDir.'/promo.mp3', 'audio');

    $this->delete(route('admin.watermark.destroy'), ['name' => 'promo.mp3'])
        ->assertRedirect(route('admin.watermark.index'));

    expect(File::exists($this->clipDir.'/promo.mp3'))->toBeFalse();
    Queue::assertPushed(ReloadWatermarkClips::class);
});

/**
 * The directory is mounted into every container on the box, so a delete must
 * not be steerable out of it.
 */
it('refuses to delete outside the clip directory', function () {
    Queue::fake();

    $outside = dirname($this->clipDir).'/outside-'.uniqid().'.mp3';
    File::put($outside, 'audio');

    try {
        $this->delete(route('admin.watermark.destroy'), ['name' => '../'.basename($outside)])
            ->assertRedirect(route('admin.watermark.index'));

        expect(File::exists($outside))->toBeTrue();
        Queue::assertNothingPushed();
    } finally {
        File::delete($outside);
    }
});

it('is not reachable without an admin session', function () {
    auth('admin')->logout();

    $this->get(route('admin.watermark.index'))->assertRedirect(route('admin.login'));
    $this->delete(route('admin.watermark.destroy'), ['name' => 'promo.mp3'])
        ->assertRedirect(route('admin.login'));
});
