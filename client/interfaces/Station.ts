export interface Station {
  id: string
  user_id: string
  name: string
  slug: string
  description: string | null
  genre: string | null
  artwork_url: string | null
  plan: string | null
  is_live: boolean
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
