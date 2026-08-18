export interface Station {
  id: string
  user_id: string
  name: string
  slug: string
  description: string | null
  genre: string | null
  artwork_url: string | null
  /** A human broadcaster is publishing right now (WHIP active). Drives the "LIVE" badge. */
  is_live: boolean
  /**
   * The mount exists and pressing play will connect — live broadcaster, AutoDJ
   * rotation, or a station sitting on silence behind an empty playlist. Drives
   * the play button + off-air state. Note this is true with no `now_playing`:
   * missing metadata means "nothing to name", not "nothing to hear".
   */
  is_on_air: boolean
  /** Track metadata pushed by Liquidsoap; null when nothing identifiable is playing. */
  now_playing: { title: string | null; artist: string | null } | null
  /** What the owner asked for. A station only holds a container while running. */
  desired_state: "stopped" | "running"
  /** When the station was last put on air; null while off air. */
  started_at: string | null
  /**
   * Coarse state, derived without touching the container — good enough for
   * lists and badges. It cannot report "starting"; fetch
   * `/stations/{slug}/status` for the precise state.
   */
  state: "offline" | "on_air" | "live"
  icecast_mount: string
  /**
   * This stream carries the audible "powered by GoCast" ID, ducked over the
   * audio every few minutes. Read-only and derived from the owner's plan —
   * there is no way to switch it off except upgrading. Present only on the
   * owner's own stations, so it is absent from public/discover payloads.
   */
  watermarked?: boolean
  /** Play station IDs between AutoDJ tracks. Off means the jingle list is stored but silent. */
  jingles_enabled: boolean
  /**
   * How jingles are spaced. "interval" is predictable in wall-clock terms
   * (legal IDs, sponsor reads) but drifts on stations with long tracks;
   * "tracks" gives even musical density but real-world spacing that swings
   * with track length. Only the active mode's setting is used — the other is
   * kept so switching back doesn't lose it.
   */
  jingle_mode: "interval" | "tracks"
  /**
   * Minimum seconds between two jingles, in "interval" mode. It is a floor,
   * not a schedule: the jingle plays at the first track boundary AFTER this
   * elapses, so it never cuts into a song.
   */
  jingle_interval_seconds: number
  /** Rotation tracks between two jingles, in "tracks" mode. Same boundary rule. */
  jingle_every_tracks: number
  social_links: Record<string, string> | null
  theme_config: Record<string, string> | null
  created_at: string
  updated_at: string
  stats?: {
    sessions: number
    total_airtime_seconds: number
    peak_listeners: number
  }
}
