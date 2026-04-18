<?php

use App\Models\Admin;

it('logs an admin out after 8 hours of inactivity', function () {
    $admin = Admin::factory()->create();

    $this->actingAs($admin, 'admin')
        ->withSession(['admin.last_activity' => now()->subHours(9)->timestamp])
        ->get('/admin')
        ->assertRedirect('/admin/login');
});

it('keeps an active admin logged in', function () {
    $admin = Admin::factory()->create();

    $this->actingAs($admin, 'admin')
        ->withSession(['admin.last_activity' => now()->subMinutes(5)->timestamp])
        ->get('/admin')
        ->assertOk();
});
