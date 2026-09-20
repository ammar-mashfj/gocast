/**
 * How a playlist is walked. "sequential" plays it in the order the drag
 * handles set, looping at the end; "shuffle" plays a random permutation of the
 * whole playlist, dealing a fresh one each time it is exhausted — so every
 * track airs once before any airs twice, and the manual order is ignored.
 */
export type PlaylistOrder = "sequential" | "shuffle"

/**
 * A named, ordered subset of a station's music tracks — one rotation among
 * possibly several. Every station has exactly one `is_default` playlist: it is
 * what AutoDJ plays when nothing else is scheduled, where uploads land when no
 * playlist is named, and it cannot be deleted.
 */
export interface Playlist {
  id: string
  station_id: string
  name: string
  is_default: boolean
  order: PlaylistOrder
  /** Display order among the station's playlists; the default is always shown first regardless. */
  position: number
  /** Present on the list endpoint, computed server-side without loading members. */
  track_count?: number
  /** Same — total member duration, in seconds. */
  duration_seconds?: number
  created_at: string
  updated_at: string
}
