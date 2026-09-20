/**
 * Which list a file belongs to. "music" is a library track, playable by
 * AutoDJ through whichever playlists it is in. "jingle" is a station ID /
 * liner, held back by Liquidsoap and slipped in at a track boundary once the
 * station's interval has elapsed — never mid-song, never in a playlist.
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
  /**
   * Context-dependent, by design. From a playlist endpoint it is the track's
   * position IN THAT PLAYLIST — the number the drag handles act on. From the
   * library it is the library order.
   */
  position: number
  original_filename: string
  created_at: string
  /**
   * The playlists this track is in. Present on the library listing (and on
   * uploads), absent from playlist member lists where it would be redundant.
   * An empty array is meaningful: a track in no playlist never plays.
   */
  playlist_ids?: string[]
}

export interface LibraryMeta {
  kind: TrackKind
  /** Whole-station usage — the cap covers both lists, so this does not change with `kind`. */
  storage_used_bytes: number
  storage_cap_bytes: number
}
