/**
 * One jingle list and the one rule that plays it:
 *
 *   "Play a [pick] jingle from [name] [how often], [when]."
 *
 * Laravel applies the rule at every AutoDJ track boundary; nothing here
 * reaches the station container directly.
 */
export type JinglePick = "random" | "in_order" | "single"
export type JingleFrequency = "minutes" | "songs" | "times"

export interface JingleList {
  id: string
  name: string
  enabled: boolean
  /** random: none repeats until all have played · in_order: list order · single: always `pinned_track_id`. */
  pick: JinglePick
  pinned_track_id: string | null
  frequency: JingleFrequency
  every_minutes: number | null
  every_songs: number | null
  /** "HH:MM" in the station's timezone, sorted. Used when frequency is "times". */
  times: string[]
  /** At set times: fade the song so the jingle starts exactly on the time. */
  exact: boolean
  /** Weekdays, 0 = Sunday; null means every day. */
  days: number[] | null
  /** "HH:MM"; both null means all day. `to_time` at or before `from_time` runs past midnight. */
  from_time: string | null
  to_time: string | null
  position: number
  last_played_at: string | null
}

/** The rule fields, as PATCH /jingle-lists/{id} takes them. */
export type JingleRule = Pick<
  JingleList,
  "pick" | "pinned_track_id" | "frequency" | "every_minutes" | "every_songs" | "times" | "exact" | "days" | "from_time" | "to_time"
>
