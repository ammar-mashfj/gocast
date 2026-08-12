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
     */
    public function createApplication()
    {
        putenv('APP_ENV=testing');
        $_ENV['APP_ENV'] = 'testing';
        $_SERVER['APP_ENV'] = 'testing';

        return parent::createApplication();
    }
}
