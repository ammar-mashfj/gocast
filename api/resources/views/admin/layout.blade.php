<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>@yield('title', 'Admin') · {{ config('app.name') }}</title>
    @vite('resources/css/admin.css')
</head>
<body class="bg-base-200">
    <div class="drawer lg:drawer-open">
        <input id="admin-drawer" type="checkbox" class="drawer-toggle">

        <div class="drawer-content flex min-h-screen flex-col">
            <header class="navbar border-b border-base-300 bg-base-100">
                <label for="admin-drawer" class="btn btn-square btn-ghost lg:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
                    </svg>
                </label>
                <h1 class="flex-1 px-2 text-lg font-semibold">@yield('title', 'Admin')</h1>
                <form method="POST" action="{{ route('admin.logout') }}">
                    @csrf
                    <button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
                </form>
            </header>

            <main class="flex-1 p-4 lg:p-6">
                @if (session('status'))
                    <div role="alert" class="alert alert-success alert-soft mb-6">
                        <span>{{ session('status') }}</span>
                    </div>
                @endif

                @if (session('error'))
                    <div role="alert" class="alert alert-error alert-soft mb-6">
                        <span>{{ session('error') }}</span>
                    </div>
                @endif

                @yield('content')
            </main>
        </div>

        <div class="drawer-side">
            <label for="admin-drawer" aria-label="Close menu" class="drawer-overlay"></label>
            <aside class="flex min-h-full w-60 flex-col border-r border-base-300 bg-base-100 p-4">
                <div class="px-2 pb-4 text-xl font-bold">{{ config('app.name') }}</div>

                <ul class="menu w-full gap-1 px-0">
                    <li>
                        <a href="{{ route('admin.stations.index') }}"
                           @class(['menu-active' => request()->routeIs('admin.stations.*')])>
                            Stations
                        </a>
                    </li>
                    <li>
                        <a href="{{ route('admin.requests.index') }}"
                           @class(['menu-active' => request()->routeIs('admin.requests.*')])>
                            Access requests
                        </a>
                    </li>
                    <li>
                        <a href="{{ route('admin.watermark.index') }}"
                           @class(['menu-active' => request()->routeIs('admin.watermark.*')])>
                            Watermark clips
                        </a>
                    </li>
                </ul>

                <div class="mt-auto truncate px-2 pt-4 text-xs opacity-60">
                    {{ auth('admin')->user()?->email }}
                </div>
            </aside>
        </div>
    </div>
</body>
</html>
