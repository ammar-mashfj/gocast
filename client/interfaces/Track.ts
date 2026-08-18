/**
 * Which list a file belongs to. "music" is the AutoDJ rotation, played in
 * `position` order on loop. "jingle" is a station ID / liner, held back by
 * Liquidsoap and slipped in at a track boundary once the station's interval
 * has elapsed — never mid-song, never in rotation order.
 */
export type TrackKind = "music" | "jingle"

export interface Track {
  id: string
  station_id: string
  kind: TrackKind
  title: string
  artist: string | null
  duration_seconds: number
  file_size_bytes: number
  position: number
  original_filename: string
  created_at: string
}

export interface LibraryMeta {
  kind: TrackKind
  /** Whole-station usage — the cap covers both lists, so this does not change with `kind`. */
  storage_used_bytes: number
  storage_cap_bytes: number
}
