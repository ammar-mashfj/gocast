<?php

use App\Filament\Widgets\CurrentlyLive;
use App\Filament\Widgets\RecentSignups;
use App\Filament\Widgets\SignupsChart;
use App\Filament\Widgets\StatsOverview;
use App\Filament\Widgets\StreamActivityChart;
use App\Filament\Widgets\WaitlistStatsOverview;
use App\Models\Admin;
use App\Models\Plan;
use App\Models\Station;
use App\Models\StreamSession;
use App\Models\User;
use App\Models\WaitlistEntry;
use Illuminate\Support\Facades\Cache;
use Livewire\Livewire;

beforeEach(function () {
    Cache::flush();
});

it('renders the dashboard page with all six widgets registered', function () {
    $admin = Admin::factory()->create();

    $response = $this->actingAs($admin, 'admin')
        ->get('/admin')
        ->assertOk();

    $content = $response->getContent();

    expect($content)->toContain('App\\\\Filament\\\\Widgets\\\\StatsOverview');
    expect($content)->toContain('App\\\\Filament\\\\Widgets\\\\WaitlistStatsOverview');
    expect($content)->toContain('App\\\\Filament\\\\Widgets\\\\SignupsChart');
    expect($content)->toContain('App\\\\Filament\\\\Widgets\\\\StreamActivityChart');
    expect($content)->toContain('App\\\\Filament\\\\Widgets\\\\RecentSignups');
    expect($content)->toContain('App\\\\Filament\\\\Widgets\\\\CurrentlyLive');
});

it('renders each dashboard widget without errors', function () {
    Plan::updateOrCreate(['id' => 1], ['name' => 'Free', 'slug' => 'free', 'max_stations' => 1, 'max_listeners' => 100]);

    User::factory()->count(5)->create();
    $owner = User::factory()->create();
    $station = Station::factory()->for($owner)->create([
        'name' => 'Radio Live',
        'slug' => 'radio-live-dash',
        'is_live' => true,
    ]);
    StreamSession::create([
        'station_id' => $station->id,
        'started_at' => now()->subHour(),
        'total_listener_minutes' => 120,
        'peak_listeners' => 10,
        'source_type' => 'browser',
    ]);
    WaitlistEntry::create(['email' => 'wl@t.test', 'plan' => 'pro']);

    $this->actingAs(Admin::factory()->create(), 'admin');

    Livewire::test(StatsOverview::class)
        ->assertSuccessful()
        ->assertSee('Total users');

    Livewire::test(WaitlistStatsOverview::class)
        ->assertSuccessful()
        ->assertSee('Waitlist total');

    Livewire::test(SignupsChart::class)
        ->assertSuccessful()
        ->assertSee('New signups');

    Livewire::test(StreamActivityChart::class)
        ->assertSuccessful()
        ->assertSee('Broadcast minutes');

    Livewire::test(RecentSignups::class)
        ->assertSuccessful()
        ->assertSee('Recent signups')
        ->assertCanSeeTableRecords([$owner]);

    Livewire::test(CurrentlyLive::class)
        ->assertSuccessful()
        ->assertSee('Currently live')
        ->assertCanSeeTableRecords([$station])
        ->assertSee('radio-live-dash');
});
