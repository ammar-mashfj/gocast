export interface Track {
  id: string
  station_id: string
  title: string
  artist: string | null
  duration_seconds: number
  file_size_bytes: number
  position: number
  original_filename: string
  created_at: string
}

export interface LibraryMeta {
  storage_used_bytes: number
  storage_cap_bytes: number
}
