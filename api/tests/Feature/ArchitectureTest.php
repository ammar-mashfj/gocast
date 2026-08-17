<?php

arch('every console command extends Laravel Command')
    ->expect('App\Console\Commands')
    ->classes()
    ->toExtend('Illuminate\Console\Command');

arch('notifications extend the Laravel base notification')
    ->expect('App\Notifications')
    ->classes()
    ->toExtend('Illuminate\Notifications\Notification');

arch('policies are classes in the App\\Policies namespace')
    ->expect('App\Policies')
    ->toBeClasses();
