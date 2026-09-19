/**
 * Live audio state, read from the station's own Liquidsoap container by
 * GET /stations/{slug}/status.
 *
 * This is the authoritative answer to "what is on air right now" — the
 * container knows, Laravel only relays. Everything here is null or false
 * when `reachable` is false, which is what an off-air (or still-booting)
 * station looks like from outside.
 */
export interface StationStatus {
  slug: string
  /**
   * offline  — nothing is on air: either the owner never started it, or the
   *            container it should have is gone. Same fix either way: start it
   * starting — the container is up and building its audio graph
   * on_air   — playing the AutoDJ playlist, or silence behind an empty one
   * live     — a broadcaster is publishing and holds the fallback
   * degraded — producing audio, but Icecast is not carrying it: the station
   *            is running and nobody can hear it
   */
  state: "offline" | "starting" | "on_air" | "live" | "degraded"
  desired_state: "stopped" | "running"
  started_at: string | null
  /** Did the container answer? False while booting, crashed, or stopped. */
  reachable: boolean
  /** Audio is actually flowing — what the broadcast pre-flight waits on. */
  ready: boolean
  /**
   * Is Icecast carrying the stream? `ready` only means the audio graph is
   * producing frames, so a station can be ready and inaudible. Null when the
   * container doesn't report it (predates the field).
   */
  icecast_connected: boolean | null
  /** Last time the container confirmed listeners could hear it. Evidence, unlike started_at. */
  last_ready_at: string | null
  /** Which source won the fallback. */
  source: "live" | "autodj" | "silence" | null
  /**
   * How the person on air connected, from the open broadcast session. Null
   * when nobody is broadcasting.
   *
   * `source` above says a human is publishing; this says how. `client` is the
   * broadcaster's software as harbor saw it and is frequently null — the
   * studio's own session row carries none — so treat it as a bonus, never as
   * the answer.
   */
  live_source: {
    type: "browser" | "electron" | "external"
    client: string | null
  } | null
  now_playing: { title: string | null; artist: string | null } | null
  /**
   * Seconds into the current track; null when unknown.
   *
   * Never rendered DIRECTLY. Status is polled over a 2s server cache, so read
   * as-is this is a stopwatch that lurches in poll-sized steps. It is instead
   * an anchor: `useTrackProgress` takes one reading, counts forward from it
   * in the browser, and only snaps back when a later poll disagrees by more
   * than the ordinary staleness — which is what lets the bar move smoothly
   * while the poll itself gets slower.
   *
   * On the silence bed it is not a track position at all: `blank()` is one
   * endless track, so it counts how long the station has been silent. That
   * case is excluded by `remaining` being absent rather than by inspecting
   * this.
   */
  elapsed: number | null
  /**
   * Seconds left of the current track; null when unknown — a live feed has no
   * length, and neither does the silence bed.
   *
   * Paired with `elapsed` to give a duration. Its ABSENCE is the signal that
   * there is no track to draw a progress bar for; see useTrackProgress.
   */
  remaining: number | null
  playlist_length: number | null
  up_next: Array<{ id: string | null; title: string; artist: string | null }>
}
