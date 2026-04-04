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
}
