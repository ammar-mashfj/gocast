<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Pin APP_ENV before Laravel boots the app under test. Docker compose
     * passes `APP_ENV=local` from api/.env via env_file, which races with
     * phpunit.xml's <env force="true">: getenv() ends up "testing" but
     * Laravel's environment detection (which runs during createApplication)
     * already cached "local" before the override applied.
     *
     * Without this, `app()->environment('testing')` returns false inside
     * tests — which silently disables guards like
     * `app()->runningUnitTests()` and lets test runs spawn real Liquidsoap
     * containers via the StationObserver. Forcing the env var here happens
     * before any Laravel bootstrap step that reads it.
     *
     * The Sentry DSN is blanked for the same reason: api/.env's live DSN
     * otherwise turns every test that asserts a failure into a Sentry issue.
     */
    public function createApplication()
    {
        putenv('APP_ENV=testing');
        $_ENV['APP_ENV'] = 'testing';
        $_SERVER['APP_ENV'] = 'testing';

        putenv('SENTRY_LARAVEL_DSN=');
        $_ENV['SENTRY_LARAVEL_DSN'] = '';
        $_SERVER['SENTRY_LARAVEL_DSN'] = '';

        // Without an admin password IcecastAdmin makes no calls. Stopping a
        // station and every reconcile pass ask Icecast to disconnect
        // listeners, and the developer's .env points at a real one; tests
        // that exercise those calls set their own fake URL and password.
        putenv('ICECAST_ADMIN_PASSWORD=');
        $_ENV['ICECAST_ADMIN_PASSWORD'] = '';
        $_SERVER['ICECAST_ADMIN_PASSWORD'] = '';

        return parent::createApplication();
    }
}
