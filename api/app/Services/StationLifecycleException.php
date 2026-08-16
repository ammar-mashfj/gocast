<?php

namespace App\Services;

use RuntimeException;

/**
 * A station start/stop was refused for a reason the caller can act on —
 * a plan limit, or a stop attempt while the station is on air.
 *
 * Carries an HTTP status and a stable machine-readable code so the SPA can
 * branch (show an upsell, offer "end broadcast first") without string-matching
 * an English message, the same way EnsureEmailIsVerified emits
 * `code: "email_unverified"`.
 */
class StationLifecycleException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    /**
     * The owner is already running as many stations as their plan allows.
     */
    public static function concurrencyLimit(int $limit): self
    {
        return new self(
            'station_limit_reached',
            $limit === 1
                ? 'Your plan allows one station on air at a time. Stop the other one first, or upgrade.'
                : "Your plan allows {$limit} stations on air at a time. Stop one first, or upgrade.",
            422,
        );
    }

    /**
     * Stopping mid-broadcast would drop every listener and end the session
     * by crash rather than through the MediaMTX not-ready hook.
     */
    public static function liveBroadcast(): self
    {
        return new self(
            'station_is_live',
            'This station is on air. End the broadcast before taking it off air.',
            409,
        );
    }

    /**
     * The container was created but was not alive moments later — a script
     * that fails to parse, an OOM kill during boot, an image that cannot run.
     *
     * 503 rather than 500: intent has already been recorded, so the reconciler
     * retries within minutes and the honest message is "not now, try again",
     * not "something is broken forever".
     */
    public static function startFailed(?string $reason = null): self
    {
        return new self(
            'station_start_failed',
            $reason ?? 'The station could not be started. We are retrying — check back in a few minutes.',
            503,
        );
    }

    /**
     * AutoDJ (the track library) is a paid feature.
     */
    public static function autoDjUnavailable(): self
    {
        return new self(
            'autodj_not_available',
            'AutoDJ is not included in your plan. Upgrade to build a playlist that runs when you are away.',
            403,
        );
    }
}
