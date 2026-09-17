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
     * by crash rather than through harbor's `live_disconnected` event.
     *
     * WHERE the broadcast has to be ended is the whole message. From the
     * studio it is the Stop button two clicks away, and "end the broadcast"
     * is obvious enough. From an external encoder there is nothing in this
     * app to press — the only thing that can end it is BUTT or Mixxx on the
     * broadcaster's own machine — and an owner told to "end the broadcast"
     * with no working control on screen reads it as a bug.
     *
     * Ending it at the encoder is still the RIGHT way, so it stays the advice.
     * But it assumes the owner can reach that machine, and the two cases where
     * they cannot are the two that matter most: a laptop that died mid-show,
     * and a stranger broadcasting on a leaked stream key. For those the stop
     * endpoint takes `force`, which is why the external variant carries its
     * own code — the SPA offers the cut-off on `station_is_live_external` and
     * never on the studio's plain `station_is_live`, where the clean control
     * exists and should be used instead.
     *
     * @param  string|null  $client  The broadcaster's software, when harbor
     *                               reported one. Naming it is the difference
     *                               between an instruction and a riddle.
     */
    public static function liveBroadcast(bool $external = false, ?string $client = null): self
    {
        $where = match (true) {
            $external && $client !== null && $client !== '' => "Disconnect {$client} to take it off air, or cut the broadcast off from here.",
            $external => 'Disconnect your encoder to take it off air, or cut the broadcast off from here.',
            default => 'End the broadcast before taking it off air.',
        };

        return new self(
            $external ? 'station_is_live_external' : 'station_is_live',
            "This station is on air. {$where}",
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
