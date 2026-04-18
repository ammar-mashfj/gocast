<?php

use App\Providers\AppServiceProvider;
use App\Providers\Filament\AdminPanelProvider;
use App\Providers\LogViewerServiceProvider;

return [
    AppServiceProvider::class,
    AdminPanelProvider::class,
    LogViewerServiceProvider::class,
];
