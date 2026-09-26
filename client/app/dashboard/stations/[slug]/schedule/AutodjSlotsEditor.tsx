"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import axios from "axios"
import api from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import type { Playlist } from "@/interfaces/Playlist"
import type { AutodjSlot, Station } from "@/interfaces/Station"
import { DayChip } from "./DayChip"
import { DAY_INITIALS, DAY_NAMES } from "./days"

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

export interface SlotRow {
  key: string
  label: string
  playlistId: string
  days: number[]
  start_time: string
  end_time: string
}

export function toSlotRow(slot: AutodjSlot): SlotRow {
  return {
    key: slot.id,
    label: slot.label ?? "",
    playlistId: slot.playlist_id,
    days: slot.days,
    start_time: slot.start_time,
    end_time: slot.end_time,
  }
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10))
  return h * 60 + m
}

/**
 * The same overlap check the API runs, so the owner sees the clash before
 * saving rather than in a 422. Returns the keys of every row involved.
 */
export function findConflicts(rows: SlotRow[]): Set<string> {
  const windows: Array<{ from: number; to: number; key: string }> = []
  for (const row of rows) {
    if (row.start_time === "" || row.end_time === "") continue
    const start = minutes(row.start_time)
    let duration = minutes(row.end_time) - start
    if (duration <= 0) duration += MINUTES_PER_DAY
    for (const day of row.days) {
      const from = day * MINUTES_PER_DAY + start
      const to = from + duration
      if (to > MINUTES_PER_WEEK) {
        windows.push({ from, to: MINUTES_PER_WEEK, key: row.key })
        windows.push({ from: 0, to: to - MINUTES_PER_WEEK, key: row.key })
      } else {
        windows.push({ from, to, key: row.key })
      }
    }
  }
  windows.sort((a, b) => a.from - b.from || a.to - b.to)
  const clashing = new Set<string>()
  for (let i = 1; i < windows.length; i++) {
    if (windows[i].from < windows[i - 1].to) {
      clashing.add(windows[i].key)
      clashing.add(windows[i - 1].key)
    }
  }
  return clashing
}

interface Props {
  slug: string
  playlists: Playlist[]
  /** Owned by the Schedule page, which shares one clock between both editors. */
  timezone: string
  rows: SlotRow[]
  setRows: Dispatch<SetStateAction<SlotRow[]>>
  conflicts: Set<string>
  /** Rows or timezone differ from what was last saved. */
  dirty: boolean
  /** The saved station, so the page can refresh its "On now" line. */
  onSaved: (station: Station) => void
}

/**
 * The owner's AutoDJ programme: which playlist plays when.
 *
 * One full-list PUT, like the show times — and, like them, its own save.
 * Nothing here turns the station on or off; a slot changes what AutoDJ
 * plays, and a live broadcast always takes over. Rows are held by the
 * Schedule page so the week strip above draws them as they are edited.
 */
export function AutodjSlotsEditor({ slug, playlists, timezone, rows, setRows, conflicts, dirty, onSaved }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const defaultPlaylist = playlists.find((p) => p.is_default) ?? null
  const playlistOptions = playlists.map((p) => ({ value: p.id, label: p.is_default ? `${p.name} (default)` : p.name }))

  function update(key: string, patch: Partial<SlotRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function toggleDay(key: string, day: number) {
    setRows((current) =>
      current.map((row) =>
        row.key === key
          ? { ...row, days: row.days.includes(day) ? row.days.filter((d) => d !== day) : [...row.days, day].sort() }
          : row,
      ),
    )
  }

  function addRow() {
    // Something other than the default, if there is one: scheduling the
    // default in a slot is legal but pointless, since it already fills gaps.
    const suggested = playlists.find((p) => !p.is_default) ?? playlists[0]
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        label: "",
        playlistId: suggested?.id ?? "",
        days: [1, 2, 3, 4, 5],
        start_time: "06:00",
        end_time: "12:00",
      },
    ])
  }

  function firstProblem(): string | null {
    if (rows.length > 0 && timezone === "") return "Pick a timezone for your slots."
    if (rows.some((row) => row.playlistId === "")) return "Pick a playlist for every slot."
    if (rows.some((row) => row.days.length === 0)) return "Pick at least one day for every slot."
    if (rows.some((row) => row.start_time === "" || row.end_time === "")) return "Every slot needs a start and an end."
    if (conflicts.size > 0) return "Two slots overlap. Slots can touch but not overlap."
    return null
  }

  async function save() {
    const problem = firstProblem()
    if (problem) {
      toast.error(problem)
      return
    }

    setSaving(true)
    try {
      const { data } = await api.put<{ data: Station }>(`/stations/${slug}/autodj-slots`, {
        timezone: timezone === "" ? null : timezone,
        slots: rows.map((row) => ({
          label: row.label.trim() === "" ? null : row.label.trim(),
          playlist_id: row.playlistId,
          days: row.days,
          start_time: row.start_time,
          end_time: row.end_time,
        })),
      })
      setRows((data.data.autodj_slots ?? []).map(toSlotRow))
      onSaved(data.data)
      toast.success("AutoDJ slots saved", {
        description: "Takes effect when the current song ends. Nothing restarts.",
      })
      router.refresh()
    } catch (error) {
      const errors = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      toast.error(Object.values(errors?.errors ?? {})[0]?.[0] ?? errors?.message ?? "Couldn't save the slots")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length > 0 && (
        // A ledger of rows split by hairlines, not tinted boxes inside the
        // page: the violet day chips and the "AutoDJ plays" label already say
        // whose time this is, and a clash is carried by the red time fields
        // and the red segment on the week above.
        <ul className="m-0 flex list-none flex-col divide-y divide-white/[0.06] border-y border-white/[0.06] p-0">
          {rows.map((row) => {
            const clashing = conflicts.has(row.key)
            const overnight = row.start_time !== "" && row.end_time !== "" && minutes(row.end_time) <= minutes(row.start_time)
            return (
              <li key={row.key} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={row.label}
                    onChange={(e) => update(row.key, { label: e.target.value })}
                    placeholder="Slot name, e.g. Breakfast (optional)"
                    aria-label="Slot name (optional)"
                    maxLength={60}
                    className="flex-1 min-w-[160px]"
                  />
                  <Select
                    aria-label="Playlist"
                    value={row.playlistId}
                    onChange={(value) => update(row.key, { playlistId: value })}
                    options={playlistOptions}
                    className="w-48 [&>button]:h-9"
                  />
                  {/* w-36, not w-28: in a 12-hour locale the native field
                      renders "12:26 AM" plus the picker icon, and 112px cut
                      it to "12:26 AI". Wraps as a group on a phone, so
                      "next day" drops under the times instead of pushing
                      the second field off the row. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      type="time"
                      value={row.start_time}
                      onChange={(e) => update(row.key, { start_time: e.target.value })}
                      className="w-36 shrink-0 font-mono tabular-nums"
                      aria-label="Start time"
                      aria-invalid={clashing || undefined}
                    />
                    <span className="text-muted-foreground text-xs" aria-hidden="true">→</span>
                    <Input
                      type="time"
                      value={row.end_time}
                      onChange={(e) => update(row.key, { end_time: e.target.value })}
                      className="w-36 shrink-0 font-mono tabular-nums"
                      aria-label="End time"
                      aria-invalid={clashing || undefined}
                    />
                    {overnight && (
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">next day</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    aria-label="Remove slot"
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>

                <div
                  role="group"
                  aria-label="Days AutoDJ plays this slot"
                  className="flex flex-wrap items-center gap-2"
                >
                  {/* Same days-and-hours shape as the show times above; the
                      label and the violet say this one is AutoDJ. */}
                  <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-on-air" aria-hidden="true" />
                    AutoDJ plays
                  </span>
                  {DAY_INITIALS.map((initial, day) => (
                    <DayChip
                      key={day}
                      tone="autodj"
                      on={row.days.includes(day)}
                      label={DAY_NAMES[day]}
                      onToggle={() => toggleDay(row.key, day)}
                    >
                      {initial}
                    </DayChip>
                  ))}
                  {clashing && (
                    <span className="ml-1 text-xs text-fault-text">Overlaps another slot.</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No slots yet. {defaultPlaylist?.name ?? "The default playlist"} plays around the clock. Add a slot
          to play a different playlist at certain hours.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          disabled={playlists.length === 0}
        >
          <IconPlus data-icon="inline-start" />
          Add slot
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save AutoDJ slots"}
        </Button>
        {dirty && !saving && (
          <span role="status" className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed max-w-[62ch]">
        Outside every slot, {defaultPlaylist?.name ?? "the default playlist"} plays. A slot
        switches when the current song ends, so it can start a few minutes late. It belongs to
        the day it starts: Friday 22:00–02:00 stays under Friday.
      </p>
    </div>
  )
}
