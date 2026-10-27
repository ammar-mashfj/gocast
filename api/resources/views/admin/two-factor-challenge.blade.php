<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Sign-in code · {{ config('app.name') }} Admin</title>
    @vite('resources/css/admin.css')
</head>
<body class="grid min-h-screen place-items-center bg-base-200 p-4">
    <div class="card w-full max-w-sm border border-base-300 bg-base-100 shadow-sm">
        <form method="POST" action="{{ route('admin.two-factor.verify') }}" class="card-body gap-4">
            @csrf

            <h1 class="card-title">Enter your sign-in code</h1>
            <p class="text-sm opacity-70">Open your authenticator app and type the six-digit code for {{ config('app.name') }} Admin.</p>

            @error('code')
                <div role="alert" class="alert alert-error alert-soft text-sm">{{ $message }}</div>
            @enderror

            <label class="floating-label">
                <span>Code</span>
                <input type="text" name="code" required autofocus inputmode="numeric" pattern="[0-9 ]*"
                       maxlength="7" autocomplete="one-time-code" placeholder="Code" class="input w-full tracking-widest">
            </label>

            <button type="submit" class="btn btn-primary w-full">Sign in</button>
            <a href="{{ route('admin.login') }}" class="link link-hover text-center text-sm opacity-70">Start over</a>
        </form>
    </div>
</body>
</html>
