<?php

use App\Services\InviteException;
use App\Services\StationLifecycleException;
use Illuminate\Contracts\Debug\ExceptionHandler;

// The 4xx refusals are the system working as designed. They used to be
// filtered by a reportable() returning false, which ran after Sentry's own
// callback had already sent them — so these assert on shouldReport(), the
// gate every reporter (Sentry included) sits behind.

it('does not report expected 4xx refusals', function () {
    $handler = app(ExceptionHandler::class);

    expect($handler->shouldReport(new StationLifecycleException('plan_limit', 'Refused', 422)))->toBeFalse()
        ->and($handler->shouldReport(InviteException::notFound()))->toBeFalse();
});

it('still reports lifecycle and invite faults', function () {
    $handler = app(ExceptionHandler::class);

    expect($handler->shouldReport(new StationLifecycleException('boot_failed', 'Container died', 500)))->toBeTrue()
        ->and($handler->shouldReport(new InviteException('broken', 'Broken', 503)))->toBeTrue();
});

it('never sends test runs to Sentry', function () {
    // api/.env carries the live DSN; a test asserting a failure used to file
    // it as a real issue.
    expect(config('sentry.dsn'))->toBeEmpty();
});
