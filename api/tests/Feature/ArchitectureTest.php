<?php

arch('every console command extends Laravel Command')
    ->expect('App\Console\Commands')
    ->classes()
    ->toExtend('Illuminate\Console\Command');

arch('notifications extend the Laravel base notification')
    ->expect('App\Notifications')
    ->classes()
    ->toExtend('Illuminate\Notifications\Notification')
    // The one thing under App\Notifications that is not a notification: the
    // payload every bell notification returns. It lives beside them because
    // that is where it is read and written, and it is a value object.
    ->ignoring('App\Notifications\Bell\BellPayload');

// The rule that actually protects the bell contract — nothing reaches the
// database channel except through BellNotification — is not expressible here,
// because it needs to read method declarations and source rather than
// namespaces. It lives in tests/Feature/Notifications/BellContractTest.php.
//
// What belongs here is the shape of the base class itself. Abstract, because
// it is a thing to extend and not a thing to dispatch: its via() and
// toDatabase() are final, and a notification that instantiated it directly
// would have no payload to store.
arch('the bell base class is a base class')
    ->expect('App\Notifications\Bell\BellNotification')
    ->toBeAbstract();

arch('policies are classes in the App\\Policies namespace')
    ->expect('App\Policies')
    ->toBeClasses();
