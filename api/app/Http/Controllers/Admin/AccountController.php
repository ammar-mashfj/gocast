<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreAccountRequest;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

/**
 * Hand-provisioning: create an account and its first station outright, without
 * the person signing up.
 *
 * This exists because there is no checkout and no invite flow. Everything else
 * that puts somebody on a paid plan (AccessRequestController) assumes they
 * already registered and filed a request, which is the wrong shape for a deal
 * agreed over email or a demo account set up before a call.
 *
 * What it does NOT do is as deliberate as what it does:
 *
 * - No container. Stations are born `stopped`, so nothing here touches Docker
 *   and the owner keeps the power button as the only thing that starts audio.
 * - No mail of any kind — no verification code, no ProAccessGranted notice, no
 *   welcome. Nothing on this path can send one: neither User nor Station has a
 *   `created` observer, no Registered event is dispatched, and every
 *   notification in the app is sent by an explicit call this controller does
 *   not make. A test asserts it, because the guarantee is the feature.
 * - No plan-limit check. The admin is authoritative, and one station is under
 *   every plan's cap regardless.
 * - It never touches an existing account. Upgrading one is what Access
 *   requests is for; the request rejects a duplicate email with that pointer.
 */
class AccountController extends Controller
{
    public function create(Request $request): View
    {
        return view('admin.accounts', [
            'plans' => Plan::orderBy('id')->get(),
            // Pro is the reason this page exists, so it is what the select
            // opens on — but resolved by slug from the table rather than
            // hard-coded to id 2, which would silently pick the wrong row on
            // an install whose plans were seeded differently.
            'defaultPlanId' => Plan::where('slug', 'pro')->value('id') ?? Plan::min('id'),
            // Survives the redirect exactly once. The hash is all that is
            // stored, so this screen is the only place the typed password can
            // be read back — which is what catches a typo before the account
            // holder does.
            'credentials' => $request->session()->get('provisioned'),
        ]);
    }

    public function store(StoreAccountRequest $request): RedirectResponse
    {
        $data = $request->validated();

        // One transaction: an account with no station is a half-finished job
        // someone has to notice and clean up, and the station is the whole
        // point of provisioning.
        [$user, $station] = DB::transaction(function () use ($data) {
            // One timestamp for the row, written by hand rather than left to
            // Eloquent, so `email_verified_at` and `created_at` are the same
            // value and not two clock reads that can straddle a second
            // boundary. Eloquent's updateTimestamps() leaves both alone once
            // they are dirty, so this is still a single insert.
            $now = now();

            $user = new User;

            // forceFill, because `email_verified_at` is deliberately outside
            // the model's Fillable list — the API must never accept it from a
            // request body, and this controller is not a request body. The
            // `password` => 'hashed' cast still applies on the way in.
            $user->forceFill([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'plan_id' => (int) $data['plan_id'],
                // The load-bearing line. `verified` guards every productive
                // route — stations, tracks, uploads, the power button, the
                // broadcast token. Without it the account logs in successfully
                // and then 403s on everything, which reads like a broken app
                // rather than a pending step. There is no unverified state to
                // resolve anyway: an address typed in here on purpose is
                // already vouched for, and nothing is emailed to confirm it.
                'email_verified_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ])->save();

            // Slug, Icecast mount and source password are all derived by
            // Station::booted(); desired_state defaults to stopped.
            $station = $user->stations()->create(['name' => $data['station_name']]);

            return [$user, $station];
        });

        // Model events log the rows themselves, but LogsActivity resolves its
        // causer off the default guard — which is never the admin guard — so
        // without this the log shows an account appearing with nobody
        // attached to it. This is the one action here worth being able to
        // trace back to a person.
        activity()
            ->causedBy($request->user('admin'))
            ->performedOn($user)
            ->withProperties([
                'station' => $station->slug,
                'plan' => $user->plan?->slug,
            ])
            ->log('provisioned account');

        return redirect()
            ->route('admin.accounts.create')
            // Flashed, not persisted: the plaintext exists only for this one
            // redirect and is gone on the next page load.
            ->with('provisioned', [
                'email' => $user->email,
                'password' => $data['password'],
                'plan' => $user->plan?->name,
                'station' => $station->name,
                'slug' => $station->slug,
            ]);
    }
}
