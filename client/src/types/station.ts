export interface StationStats {
  sessions: number
  total_airtime_seconds: number
  peak_listeners: number
}

export interface Station {
  id: string
  user_id: number
  name: string
  slug: string
  description: string | null
  genre: string | null
  artwork_url: string | null
  plan: string
  is_live: boolean
  icecast_mount: string
  social_links: Record<string, string> | null
  theme_config: Record<string, unknown> | null
  created_at: string
  updated_at: string
  stats?: StationStats
}

export interface StreamSession {
  id: string
  station_id: string
  started_at: string
  ended_at: string | null
  peak_listeners: number
  total_listener_minutes: number
  source_type: string
}
