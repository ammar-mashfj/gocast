@extends('admin.layout')

@section('title', 'Create account')

@section('content')
    @if ($credentials)
        {{-- The only time the password is ever readable. Rendered above the form
             rather than as a flash banner so it is impossible to scroll past, and
             it disappears on the next page load. --}}
        <div class="card mb-6 border border-success bg-base-100 shadow-sm">
            <div class="card-body gap-4">
                <div>
                    <h2 class="card-title text-base">Account created</h2>
                    <p class="text-sm opacity-70">
                        Station <strong>{{ $credentials['station'] }}</strong>
                        (<code>{{ $credentials['slug'] }}</code>) on
                        <strong>{{ $credentials['plan'] }}</strong>. It is stopped —
                        the owner starts it from their dashboard.
                    </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                    <div>
                        <div class="text-xs uppercase opacity-60">Email</div>
                        <code class="text-sm break-all">{{ $credentials['email'] }}</code>
                    </div>
                    <div>
                        <div class="text-xs uppercase opacity-60">Password</div>
                        <code class="text-sm break-all">{{ $credentials['password'] }}</code>
                    </div>
                </div>

                <p class="text-xs opacity-60">
                    Check the password reads as you meant it to, then hand both over. Only
                    the hash is stored, so this screen is the last place the plaintext
                    exists — after this, a lost password needs the sign-in page's
                    "Forgot password" flow. Nothing has been emailed.
                </p>
            </div>
        </div>
    @endif

    <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <form method="POST" action="{{ route('admin.accounts.store') }}" class="card-body gap-4">
                    @csrf

                    <div>
                        <h2 class="card-title">New account</h2>
                        <p class="text-sm opacity-70">
                            For someone who has not registered. Creates the person, puts them
                            on a plan, and gives them their first station — nothing is emailed.
                        </p>
                    </div>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Name</legend>
                        <input type="text" name="name" value="{{ old('name') }}" required autofocus
                               maxlength="255" placeholder="Their name"
                               class="input w-full @error('name') input-error @enderror">
                        @error('name')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Email</legend>
                        <input type="email" name="email" value="{{ old('email') }}" required
                               maxlength="255" placeholder="them@example.com"
                               class="input w-full @error('email') input-error @enderror">
                        <p class="label">Marked verified on creation, so they can log in and go straight to work.</p>
                        @error('email')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Password</legend>
                        <input type="text" name="password" value="{{ old('password') }}" required
                               minlength="8" placeholder="What they will sign in with"
                               autocomplete="off"
                               class="input w-full font-mono @error('password') input-error @enderror">
                        <p class="label">Minimum 8 characters. Shown back to you once on the next screen, then only its hash is kept.</p>
                        @error('password')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Plan</legend>
                        <select name="plan_id" class="select w-full @error('plan_id') select-error @enderror">
                            @foreach ($plans as $plan)
                                <option value="{{ $plan->id }}"
                                        @selected((int) old('plan_id', $defaultPlanId) === $plan->id)>
                                    {{ $plan->name }} —
                                    {{ $plan->max_stations }} {{ Str::plural('station', $plan->max_stations) }},
                                    {{ $plan->max_listeners }} listeners,
                                    AutoDJ {{ $plan->autodj_enabled ? 'on' : 'off' }}{{ $plan->watermark_enabled ? ', watermarked' : '' }}
                                </option>
                            @endforeach
                        </select>
                        @error('plan_id')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Station name</legend>
                        <input type="text" name="station_name" value="{{ old('station_name') }}" required
                               maxlength="100" placeholder="Their station"
                               class="input w-full @error('station_name') input-error @enderror">
                        <p class="label">The slug and stream mount are derived from this and cannot be changed afterwards.</p>
                        @error('station_name')
                            <p class="label text-error">{{ $message }}</p>
                        @enderror
                    </fieldset>

                    <div class="border-t border-base-300 pt-4">
                        <button type="submit" class="btn btn-primary">Create account and station</button>
                    </div>
                </form>
            </div>
        </section>

        <aside class="space-y-6">
            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">What this does</h2>
                    <ul class="list-disc space-y-2 pl-4 text-sm opacity-70">
                        <li>Creates the account already verified, on the plan you pick.</li>
                        <li>Creates one station, <strong>stopped</strong> — no container is started and no audio goes out.</li>
                        <li>Sends nothing at all — no verification code, no welcome mail, no plan notice.</li>
                        <li>Records who provisioned it in the activity log.</li>
                    </ul>
                </div>
            </div>

            <div class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">Already have an account?</h2>
                    <p class="text-sm opacity-70">
                        This form only creates new ones. To move an existing account onto a
                        paid plan, approve it from
                        <a href="{{ route('admin.requests.index') }}" class="link">Access requests</a>.
                    </p>
                </div>
            </div>
        </aside>
    </div>
@endsection
