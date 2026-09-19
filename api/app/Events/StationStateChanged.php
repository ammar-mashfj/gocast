<?php

namespace App\Events;

use App\Models\Station;
use App\Services\StationStatusService;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Support\Facades\Date;

/**
 * "Something about this station changed — go look."
 *
 * A SIGNAL, not a payload. It deliberately carries no status fields: the
 * client refetches `GET /stations/{slug}/status` when one of these lands, and
 * renders the answer it already knows how to render.
 *
 * That is a design choice, not laziness. The alternative — putting the new
 * state on the wire — means a second copy of the rules in
 * {@see StationStatusService::state()}, written in TypeScript,
 * kept in step by hand. Two state machines that must agree is how the old
 * `is_live` column went wrong. Here the container stays the single authority
 * for what is on air; broadcasting only removes the WAITING.
 *
 * The cost is one extra round-trip per event instead of zero. Against the up
 * to ten seconds a dashboard waits today, that is not a trade worth thinking
 * about — and the refetch reads through the same policy check and the same
 * 2-second status cache as every other poll, so a burst of events cannot turn
 * into a burst of container reads.
 *
 * ShouldDispatchAfterCommit is belt-and-braces: neither dispatch site sits in
 * a transaction today (StationLifecycleService takes a cache lock, not a DB
 * one), but "a station came up" must never be announced by a write that then
 * rolls back, and the interface makes that true for any future caller that
 * does wrap one.
 *
 * Nothing here is load-bearing. A dropped event costs freshness — the
 * reconcile poll in useStationStatus still runs underneath — and never leaves
 * a station stranded. Same contract as the container callbacks that produce
 * these; see StationEventController's class docblock.
 */
class StationStateChanged implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets;

    /**
     * Scalars, not the Station model, and no SerializesModels.
     *
     * Two reasons. The worker does not need the row — everything it puts on
     * the wire is already here — so re-resolving it would be a query per
     * event. And `stopped`/`shutdown` fire around deletion: a model reloaded
     * after the row is gone throws ModelNotFoundException and the job dies
     * retrying, which turns the tidiest moment in the lifecycle into the one
     * that pages someone.
     */
    public function __construct(
        public readonly string $slug,
        public readonly string $userId,
        public readonly string $event,
        public readonly string $at,
    ) {}

    /**
     * Build from a station, which is how every caller does it.
     *
     * `$at` is stamped at DISPATCH, not at broadcast. The queue may sit for a
     * moment and a retry re-runs the job; either way the timestamp has to
     * describe when the thing happened, because the client uses it to discard
     * an event that arrives behind a fresher one. Stamping in the worker would
     * make a retried event look newer than the state it is reporting on.
     */
    public static function for(Station $station, string $event): self
    {
        return new self(
            slug: $station->slug,
            userId: (string) $station->user_id,
            event: $event,
            at: Date::now()->toIso8601String(),
        );
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('user.'.$this->userId);
    }

    /**
     * Its own queue, ahead of `default`.
     *
     * Production runs ONE worker (infra/native/systemd/gocast-queue.service),
     * and the default queue carries uploads and track analysis — jobs that
     * take tens of seconds. A push that exists to beat a ten-second poll
     * cannot sit behind one of those. The worker is started with
     * `--queue=realtime,default`, so it drains this queue before it looks at
     * the other; a worker started WITHOUT that flag never consumes this
     * queue and every broadcast waits forever.
     */
    public function broadcastQueue(): string
    {
        return 'realtime';
    }

    /**
     * A stable name the client binds to, instead of the FQCN Laravel would
     * otherwise put on the wire. Moving or renaming this class must not be a
     * breaking change for a browser that is already connected.
     */
    public function broadcastAs(): string
    {
        return 'station.state';
    }

    /** @return array<string, string> */
    public function broadcastWith(): array
    {
        return [
            'slug' => $this->slug,
            'event' => $this->event,
            'at' => $this->at,
        ];
    }
}
