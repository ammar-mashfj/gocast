<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
*/

/**
 * One private channel per account, carrying station lifecycle signals for
 * every station this user owns.
 *
 * Deliberately NOT one channel per station, which is the more obvious model
 * and would let StationPolicy@view do the authorization directly. Ably's free
 * tier caps CONCURRENT CHANNELS at 200 alongside its 200 connections, and a
 * per-station channel costs one per station being watched plus one more when
 * the notification bell moves onto this transport — double the ceiling
 * consumption for the same information. An owner watching three stations
 * costs one channel here.
 *
 * Revisit on Reverb, where there is no channel ceiling and per-station
 * channels are tidier.
 *
 * Consequence worth knowing: this channel is OWNER-scoped, so an admin
 * viewing someone else's station in the panel gets no pushes and falls back
 * to polling. That is the intended trade, not an oversight.
 *
 * Compared as strings: users are auto-incrementing integers while stations
 * are UUIDs, and the placeholder always arrives from the URL as a string.
 * `(int)` casting a malformed segment yields 0, which would match nothing —
 * but only by luck, not by rule.
 */
Broadcast::channel('user.{id}', function (User $user, string $id): bool {
    return (string) $user->id === $id;
});
