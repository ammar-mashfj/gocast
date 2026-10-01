/**
 * The jingle frequencies offered as one row of choices (the prototype's),
 * across both of the station's modes: by time and by tracks. Anything else
 * the station is set to shows as "Custom", which opens the full controls —
 * so no setting that works today is lost to the shorter list.
 */
export type JingleMode = "interval" | "tracks"

export interface JinglePreset {
  key: string
  label: string
  mode: JingleMode
  /** Minutes for "interval", tracks for "tracks". */
  value: number
}

export const JINGLE_PRESETS: readonly JinglePreset[] = [
  { key: "30m", label: "30 min", mode: "interval", value: 30 },
  { key: "1h", label: "1 hr", mode: "interval", value: 60 },
  { key: "3t", label: "3 tracks", mode: "tracks", value: 3 },
  { key: "5t", label: "5 tracks", mode: "tracks", value: 5 },
]

export const CUSTOM = "custom"

/** The preset the current setting matches, or "custom". */
export function presetFor(mode: JingleMode, intervalMinutes: number, everyTracks: number): string {
  const value = mode === "interval" ? intervalMinutes : everyTracks
  return JINGLE_PRESETS.find((p) => p.mode === mode && p.value === value)?.key ?? CUSTOM
}
