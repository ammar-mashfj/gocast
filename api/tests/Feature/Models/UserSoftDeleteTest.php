<?php

use App\Models\User;

it('soft-deletes a user', function () {
    $user = User::factory()->create();
    $id = $user->id;

    $user->delete();

    expect(User::find($id))->toBeNull();
    expect(User::withTrashed()->find($id))->not->toBeNull();
    expect(User::withTrashed()->find($id)->deleted_at)->not->toBeNull();
});

it('restores a soft-deleted user', function () {
    $user = User::factory()->create();
    $user->delete();

    User::withTrashed()->find($user->id)->restore();

    expect(User::find($user->id))->not->toBeNull();
});
