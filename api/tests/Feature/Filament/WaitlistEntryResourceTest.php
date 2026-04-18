<?php

use App\Filament\Resources\WaitlistEntries\Pages\ListWaitlistEntries;
use App\Models\Admin;
use App\Models\WaitlistEntry;
use Livewire\Livewire;

beforeEach(function () {
    $this->actingAs(Admin::factory()->create(), 'admin');
});

it('lists waitlist entries', function () {
    $entry = WaitlistEntry::create(['email' => 'hi@there.test', 'plan' => 'pro']);

    Livewire::test(ListWaitlistEntries::class)
        ->assertCanSeeTableRecords([$entry]);
});

it('deletes a waitlist entry (hard delete)', function () {
    $entry = WaitlistEntry::create(['email' => 'gone@there.test', 'plan' => 'starter']);

    Livewire::test(ListWaitlistEntries::class)
        ->callTableAction('delete', $entry);

    expect(WaitlistEntry::find($entry->id))->toBeNull();
});

it('exports selected rows as CSV', function () {
    $a = WaitlistEntry::create(['email' => 'a@t.test', 'plan' => 'pro']);
    $b = WaitlistEntry::create(['email' => 'b@t.test', 'plan' => 'free']);

    Livewire::test(ListWaitlistEntries::class)
        ->callTableBulkAction('export_csv', [$a->id, $b->id])
        ->assertFileDownloaded();
});
