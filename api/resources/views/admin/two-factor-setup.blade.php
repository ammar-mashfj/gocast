@extends('admin.layout')

@section('title', 'Two-factor sign-in')

@section('content')
    <div class="card max-w-xl border border-base-300 bg-base-100 shadow-sm">
        <form method="POST" action="{{ route('admin.two-factor.confirm') }}" class="card-body gap-4">
            @csrf

            <div>
                <h2 class="card-title">Set up two-factor sign-in</h2>
                <p class="text-sm opacity-70">
                    The admin panel asks for a code from an authenticator app as well as your password.
                    Set it up once here; you can’t use the rest of the panel until it’s on.
                </p>
            </div>

            <ol class="list-decimal space-y-3 pl-5 text-sm">
                <li>
                    In your authenticator app (Google Authenticator, 1Password, Authy, Aegis…), add an account
                    with a setup key and enter:
                    <code class="mt-2 block rounded bg-base-200 px-3 py-2 font-mono text-base tracking-wider select-all">{{ $secret }}</code>
                    <span class="mt-1 block opacity-70">Time-based, six digits. On this phone you can
                        <a href="{{ $uri }}" class="link">open it in the app</a> instead.</span>
                </li>
                <li>Type the code the app shows to confirm.</li>
            </ol>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Code</legend>
                <input type="text" name="code" required autofocus inputmode="numeric" pattern="[0-9 ]*" maxlength="7"
                       autocomplete="one-time-code" class="input w-48 tracking-widest @error('code') input-error @enderror">
                @error('code')<p class="label text-error">{{ $message }}</p>@enderror
            </fieldset>

            <p class="text-sm opacity-70">
                Lost the phone later? Someone with server access runs
                <code>php artisan admin:reset-two-factor {{ auth('admin')->user()->email }}</code>.
            </p>

            <div>
                <button type="submit" class="btn btn-primary">Turn on</button>
            </div>
        </form>
    </div>
@endsection
