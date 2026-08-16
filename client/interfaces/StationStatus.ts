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
   * offline  — the owner has not started it, no container exists
   * starting — meant to be on air; container booting (or being restarted)
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
  now_playing: { title: string | null; artist: string | null } | null
  /** Seconds into the current track; null when unknown. */
  elapsed: number | null
  /** Seconds left of the current track; null when unknown (e.g. a live feed). */
  remaining: number | null
  playlist_length: number | null
  up_next: Array<{ id: string | null; title: string; artist: string | null }>
}
