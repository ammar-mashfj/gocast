<?php

namespace App\Providers;

use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Opcodes\LogViewer\Facades\LogViewer;

class LogViewerServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        LogViewer::auth(function ($request) {
            return $request->user('admin') !== null;
        });

        Gate::define('viewLogViewer', fn ($admin) => $admin !== null);
    }
}
