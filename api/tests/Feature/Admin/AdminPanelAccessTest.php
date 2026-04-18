<?php

use App\Models\Admin;
use App\Models\User;

it('redirects an unauthenticated visitor from the dashboard to the admin login', function () {
    $this->get('/admin')
        ->assertRedirect('/admin/login');
});

it('lets an admin with 2FA confirmed reach the dashboard', function () {
    $admin = Admin::factory()->create();

    $this->actingAs($admin, 'admin')
        ->get('/admin')
        ->assertOk();
});

it('does not let a customer User authenticate into the admin guard', function () {
    $user = User::factory()->create();

    $this->actingAs($user, 'admin')
        ->get('/admin')
        ->assertForbidden();
});
