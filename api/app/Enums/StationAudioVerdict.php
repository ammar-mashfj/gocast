<?php

namespace App\Enums;

/**
 * What one observation of a running station concluded.
 *
 * Every branch of the auto-stop decision terminates in exactly one of these,
 * which is the point: the question "why is this station still on air?" has a
 * single answer per pass, and it is written to the log verbatim.
 *
 * Only {@see self::Stop} results in a station being taken off air.
 */
enum StationAudioVerdict: string
{
    /**
     * Audio is flowing, or a broadcaster is attached. Nothing to do, and the
     * silence clock is cleared — the window measures CONTINUOUS silence, so
     * any evidence of use has to reset it.
     */
    case InUse = 'in_use';

    /**
     * The container did not answer, or answered "not ready". Says nothing
     * about whether audio is flowing: a booting container, a crashed one and
     * a stopped one look identical from here, and only Docker can tell them
     * apart. The clock is neither started nor advanced.
     */
    case Unreachable = 'unreachable';

    /**
     * The container answered but did not report the fields this decision
     * needs — an image predating them, mid-rollout. Unknown is not silence;
     * never act on it.
     */
    case Unreported = 'unreported';

    /**
     * No audio and nothing attached to produce any, but the silence window
     * has not elapsed yet. The clock is running.
     */
    case Silent = 'silent';

    /**
     * Silent for longer than the window, with nothing that could start
     * playing on its own. The only verdict that stops a station.
     */
    case Stop = 'stop';

    /**
     * A rotation this station is entitled to play exists, and the container
     * is emitting nothing anyway — a stalled playlist, undecodable files, a
     * wedged audio graph.
     *
     * Deliberately NOT a stop. This is a paying customer whose station reads
     * as on air while transmitting silence, and stopping it would replace a
     * visible fault with an invisible one. It wants attention, not teardown.
     */
    case Fault = 'fault';
}
