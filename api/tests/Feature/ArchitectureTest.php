<?php

arch('every console command extends Laravel Command')
    ->expect('App\Console\Commands')
    ->classes()
    ->toExtend('Illuminate\Console\Command');

arch('notifications extend the Laravel base notification')
    ->expect('App\Notifications')
    ->classes()
    ->toExtend('Illuminate\Notifications\Notification');

arch('admin panel code never imports customer controllers')
    ->expect('App\Filament')
    ->not->toUse('App\Http\Controllers');

arch('policies are classes in the App\\Policies namespace')
    ->expect('App\Policies')
    ->toBeClasses();
