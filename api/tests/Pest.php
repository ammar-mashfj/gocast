<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Session;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->beforeEach(function () {
        // Cache + session are the `array` drivers in tests (see phpunit.xml).
        // Array storage lives in a static on each repository for the
        // lifetime of the PHP process, so without explicit flushes every
        // test inherits the previous test's:
        //   • rate-limit counters / password-reset codes / broadcast state
        //     (cache) — symptom: `throttle:3,1` endpoints reject after
        //     test #4 in a file.
        //   • authenticated user on each guard (session) — symptom:
        //     `actingAs(...)` doesn't actually override a prior test's
        //     auth, so an assertion expecting Forbidden silently sees the
        //     previous test's user and gets 200.
        // Both surface as "passes alone, fails in suite" — the trickiest
        // form of flake to debug. Flushing all three sidesteps it.
        Cache::flush();
        Session::flush();
        Auth::forgetGuards();
    })
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}
