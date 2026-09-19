"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import api from "@/lib/axios"
import { StationStatus } from "@/interfaces/StationStatus"
import { useRealtime } from "@/contexts/RealtimeContext"

/** While a station is coming up, the answer changes every few seconds. */
const POLL_STARTING_MS = 2000
/** On air and steady: slow enough to be cheap, quick enough for a progress bar. */
const POLL_STEADY_MS = 10000
/** Off air, nothing to watch — just enough to notice someone else starting it. */
const POLL_OFFLINE_MS = 30000
/**
 * Steady pace while a websocket is carrying lifecycle signals.
 *
 * The poll does not stop when push is available, it slows down — it is the
 * reconcile layer, and three things still have no producer and never will:
 * the audio graph going ready, a container that DIES (docker kill, an OOM, a
 * host reboot — none of them fire shutdown, and the absence of an event is
 * not an event), and now_playing/elapsed/remaining, which exist only on the
 * container-pull path.
 *
 * Not slower than this, because now_playing rides on the poll. The
 * track-aware rule in intervalFor() still tightens the next read around a
 * track boundary, so the headline stays accurate; this number only governs
 * the case where `remaining` is unknown.
 */
const POLL_PUSHED_MS = 30000
/**
 * How long a burst of signals is collapsed into one refetch.
 *
 * A broadcaster connecting produces live_connected, and an Icecast blip can
 * produce disconnect/connect within a few hundred milliseconds. Each one
 * would otherwise be its own request for the same answer. Short enough to be
 * invisible against the ten seconds this replaces.
 */
const SIGNAL_COALESCE_MS = 120
/**
 * Floor for the track-aware poll below. Without it, a rotation of very short
 * files would have the dashboard polling the container several times a second.
 */
const POLL_FLOOR_MS = 3000
/** Grace after a track is due to end, so the next one has announced itself. */
const TRACK_END_GRACE_MS = 750
/**
 * Back-off ceiling for a status endpoint that keeps failing.
 *
 * A failed read used to return null, which `intervalFor` read as "still
 * booting" and paced at POLL_STARTING_MS — so the one case where the server
 * is struggling was the case we polled it hardest. Consecutive failures now
 * double the wait up to this cap, and any success resets it.
 */
const POLL_MAX_BACKOFF_MS = 30000

/** Sentinel for "the request itself failed", distinct from a null status. */
const FAILED = Symbol("failed")

function backoffFor(failures: number): number {
  return Math.min(POLL_MAX_BACKOFF_MS, POLL_STARTING_MS * 2 ** (failures - 1))
}

function intervalFor(status: StationStatus | null, pushed: boolean): number {
  if (!status) return POLL_STARTING_MS

  // `starting` keeps its fast pace EVEN WITH PUSH, and this is the one place
  // the socket is deliberately not trusted. Leaving `starting` is normally
  // announced by icecast_connected — but a container that dies while booting
  // announces nothing at all, and that is precisely when it happens. Boots
  // are short; paying 2s polls for them buys the failure case.
  if (status.state === "starting") return POLL_STARTING_MS

  if (status.state === "offline") return POLL_OFFLINE_MS

  // Push only raises the CEILING. It must not skip the track-aware rule
  // below, because nothing on the socket carries `now_playing` — a fixed
  // interval here leaves the headline stale for the whole of it, which is
  // worse than the poll it replaced rather than better.
  const ceiling = pushed ? POLL_PUSHED_MS : POLL_STEADY_MS

  // Poll when there is something new to see, rather than on a fixed tick.
  //
  // The container tells us how much of the current track is left, so the next
  // interesting moment is knowable instead of guessable. On a normal track
  // `remaining` is minutes and this changes nothing; near a boundary it pulls
  // the next read in, so the headline updates a second after the track does
  // instead of at the end of the ceiling. Costs one extra request per track.
  const remaining = status.remaining
  if (typeof remaining === "number" && remaining >= 0) {
    return Math.min(ceiling, Math.max(POLL_FLOOR_MS, remaining * 1000 + TRACK_END_GRACE_MS))
  }

  // No track length: a live broadcast, or the silence bed. Nothing to time
  // the next read against, so the ceiling is all there is — which is exactly
  // why `audio_started` is broadcast from the now-playing push. Silence is
  // the one state whose exit this rule cannot see coming.
  return ceiling
}

/**
 * Polls a station's live status, pacing itself by what it finds: fast while
 * the container is booting, slow once the answer has settled.
 *
 * Polling stops while the tab is hidden — a dashboard left open in a
 * background tab shouldn't keep asking a container what it is playing — and
 * resumes with an immediate read so the UI is never stale on return.
 *
 * @param intervalMs Override the self-pacing above with a fixed cadence, for a
 *   caller that is WATCHING FOR A SPECIFIC EVENT rather than displaying the
 *   current state. The encoder panel is the one such caller: it waits for a
 *   DJ to press Connect in BUTT, and `intervalFor` would pace an on-air
 *   station at up to ten seconds — long enough that the dialog looks broken
 *   while the encoder is already live. Failures still back off; nothing that
 *   omits this changes behaviour.
 */
export function useStationStatus(slug: string, enabled = true, intervalMs?: number) {
  const [status, setStatus] = useState<StationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)
  /** Consecutive failed reads, for the back-off in tick(). Reset by any success. */
  const failures = useRef(0)
  /**
   * `at` of the newest signal already acted on, so a replay after a reconnect
   * does not trigger a refetch for something we have. Delivery is ordered per
   * channel; reconnects are where that stops being enough.
   */
  const lastSignalAt = useRef("")

  // Null on any surface outside the dashboard layout, and when the key is
  // unset. Both mean the same thing here: poll the way we always did.
  const realtime = useRealtime()
  const pushed = realtime?.connected ?? false

  /**
   * Internal read. Returns FAILED on error so tick() can back off; the
   * exported refresh() below flattens that back to null, keeping the sentinel
   * out of consumers' hands.
   */
  const read = useCallback(async (): Promise<StationStatus | null | typeof FAILED> => {
    try {
      const { data } = await api.get<{ data: StationStatus }>(`/stations/${slug}/status`)
      if (!cancelled.current) setStatus(data.data)
      failures.current = 0
      return data.data
    } catch {
      // Network blip or a 403 from a session that just expired — keep the
      // last known status rather than flashing the UI back to "unknown".
      //
      // Reported as FAILED rather than null so the caller can tell a failed
      // read from a station with no status, and back off instead of
      // retrying at the fastest cadence.
      failures.current += 1
      return FAILED
    } finally {
      if (!cancelled.current) setLoading(false)
    }
  }, [slug])

  const refresh = useCallback(async (): Promise<StationStatus | null> => {
    const result = await read()

    return result === FAILED ? null : result
  }, [read])

  useEffect(() => {
    if (!enabled) return
    cancelled.current = false
    let coalesce: ReturnType<typeof setTimeout> | null = null
    /**
     * Which run of the loop a tick belongs to. restart() bumps it, so a tick
     * that was already awaiting read() when the restart happened finds itself
     * stale on resume and does not schedule a successor — clearing the timer
     * alone cannot reach a tick that has not set one yet.
     *
     * Without this every signal that lands mid-request leaves TWO loops
     * running: the restarted one and the orphan, whose timer nobody holds.
     * Signals arrive exactly then — live_connected lands while `starting`
     * is polling every two seconds — and the orphans accumulate for as long
     * as the dashboard stays open.
     */
    let generation = 0

    async function tick() {
      if (cancelled.current) return
      const mine = generation
      const next = document.hidden ? status : await read()
      // The read itself is not wasted: it already wrote the fresher status.
      // Only the scheduling belongs to the run that started it.
      if (cancelled.current || mine !== generation) return
      timer.current = setTimeout(
        tick,
        next === FAILED
          ? backoffFor(failures.current)
          : // A caller's fixed cadence is an override for the POLL, and the
            // poll is not how this is learned any more. GoLiveTrigger asks
            // for 2s because it is waiting for a DJ to press Connect in BUTT
            // and ten seconds makes the dialog look broken — but
            // live_connected is pushed, so while the socket is up that wait
            // is over before a poll would have happened. Honour the override
            // again the moment it drops.
            pushed
            ? intervalFor(next, true)
            : (intervalMs ?? intervalFor(next, false)),
      )
    }

    // Restart the loop rather than firing a bare read alongside it, so a
    // pending timer never puts a second request in flight against the one
    // already scheduled — the overlap this hook's await-then-schedule shape
    // exists to avoid. The generation bump retires a tick that is mid-read,
    // which the timer clear cannot see.
    function restart() {
      generation += 1
      if (timer.current) clearTimeout(timer.current)
      tick()
    }

    tick()

    function onVisible() {
      if (document.hidden) return
      restart()
    }
    document.addEventListener("visibilitychange", onVisible)

    // The push half. A signal says only that THIS station changed and when;
    // the answer still comes from the status endpoint, so there is no second
    // state machine here to drift from StationStatusService::state().
    const unsubscribe = realtime?.onStationSignal((signal) => {
      if (signal.slug !== slug) return
      // Strictly older, not older-or-equal. `at` comes from Carbon's
      // toIso8601String(), which stops at whole seconds, and events genuinely
      // arrive inside one — icecast_disconnected and icecast_error are
      // emitted from the same failure, and a disconnect/reconnect pair can
      // land together. Dropping a same-second event would lose the one that
      // describes where the station ended up. The cost of the looser test is
      // a redundant refetch after a reconnect replay, which the coalesce
      // window below absorbs.
      if (signal.at < lastSignalAt.current) return
      lastSignalAt.current = signal.at

      // A hidden tab stays hidden: tick() short-circuits on document.hidden,
      // and onVisible() already forces a read on return. Refetching here
      // would undo the whole point of pausing.
      if (document.hidden) return

      if (coalesce) clearTimeout(coalesce)
      coalesce = setTimeout(restart, SIGNAL_COALESCE_MS)
    })

    return () => {
      cancelled.current = true
      if (timer.current) clearTimeout(timer.current)
      if (coalesce) clearTimeout(coalesce)
      document.removeEventListener("visibilitychange", onVisible)
      unsubscribe?.()
    }
    // `status` is read inside tick() only to keep the pace while hidden;
    // including it would restart the loop on every poll.
    //
    // `pushed` IS a dependency, and re-running on it is deliberate: the loop
    // has to re-pace when the socket comes or goes, and the immediate tick()
    // on the way back up is what covers whatever was missed while it was
    // down. That is the resync, and it is why nothing here needs to replay
    // events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, enabled, read, intervalMs, realtime, pushed])

  return { status, loading, refresh }
}
