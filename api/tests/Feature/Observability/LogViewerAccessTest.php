<?php

use App\Models\Admin;
use App\Models\User;

it('rejects an unauthenticated visitor from /log-viewer', function () {
    $this->get('/log-viewer')->assertForbidden();
});

it('rejects a customer User from /log-viewer', function () {
    $user = User::factory()->create();

    $this->actingAs($user, 'web')
        ->get('/log-viewer')
        ->assertForbidden();
});

it('lets an admin reach /log-viewer', function () {
    $admin = Admin::factory()->create();

    $this->actingAs($admin, 'admin')
        ->get('/log-viewer')
        ->assertOk();
});
