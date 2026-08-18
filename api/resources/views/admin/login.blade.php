<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Sign in · {{ config('app.name') }} Admin</title>
    @vite('resources/css/admin.css')
</head>
<body class="grid min-h-screen place-items-center bg-base-200 p-4">
    <div class="card w-full max-w-sm border border-base-300 bg-base-100 shadow-sm">
        <form method="POST" action="{{ route('admin.login.store') }}" class="card-body gap-4">
            @csrf

            <h1 class="card-title">{{ config('app.name') }} admin</h1>

            @error('email')
                <div role="alert" class="alert alert-error alert-soft text-sm">{{ $message }}</div>
            @enderror

            <label class="floating-label">
                <span>Email</span>
                <input type="email" name="email" value="{{ old('email') }}" required autofocus
                       autocomplete="username" placeholder="Email" class="input w-full">
            </label>

            <label class="floating-label">
                <span>Password</span>
                <input type="password" name="password" required autocomplete="current-password"
                       placeholder="Password" class="input w-full">
            </label>

            <label class="label cursor-pointer justify-start gap-2">
                <input type="checkbox" name="remember" value="1" class="checkbox checkbox-sm">
                <span>Remember me</span>
            </label>

            <button type="submit" class="btn btn-primary w-full">Sign in</button>
        </form>
    </div>
</body>
</html>
