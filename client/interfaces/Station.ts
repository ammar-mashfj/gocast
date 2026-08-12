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
  /** Anything is playing — live broadcaster OR AutoDJ rotation. Drives play button + off-air state. */
  is_on_air: boolean
  /** Track metadata pushed by Liquidsoap; null when nothing is playing. */
  now_playing: { title: string | null; artist: string | null } | null
  icecast_mount: string
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
