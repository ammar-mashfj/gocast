"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconClockPlay, IconPlus, IconTrash } from "@tabler/icons-react"
import axios from "axios"
import api from "@/lib/axios"
import { useMounted } from "@/hooks/useMounted"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"
import { describeProgramme } from "@/lib/programme"
import type { Playlist } from "@/interfaces/Playlist"
import type { AutodjSlot, Programme, Station } from "@/interfaces/Station"
import { TimezoneCombobox } from "../TimezoneCombobox"
import { WeekStrip, type StripSlot } from "./WeekStrip"

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

interface Row {
  key: string
  label: string
  playlistId: string
  days: number[]
  start_time: string
  end_time: string
}

function toRow(slot: AutodjSlot): Row {
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
function findConflicts(rows: Row[]): Set<string> {
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
  station: Station
  playlists: Playlist[]
}

/**
 * The owner's AutoDJ programme: which playlist plays when.
 *
 * One full-list PUT, like the show times — and, like them, its own editor.
 * Nothing here turns the station on or off; a slot changes what AutoDJ
 * plays, and a live broadcast always takes over.
 */
export function AutodjSlotsEditor({ station, playlists }: Props) {
  const router = useRouter()
  const locked = useAutoDjLocked()

  // Server-rendered page: the viewer's zone cannot be read while deciding
  // the first frame — see ScheduleEditor for the hydration reasoning.
  const mounted = useMounted()
  const [chosen, setChosen] = useState<string | null>(station.timezone)
  const timezone = chosen ?? (mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")

  const [rows, setRows] = useState<Row[]>((station.autodj_slots ?? []).map(toRow))
  const [programme, setProgramme] = useState<Programme | null>(station.programme ?? null)
  const [saving, setSaving] = useState(false)

  const defaultPlaylist = playlists.find((p) => p.is_default) ?? null
  const playlistOptions = playlists.map((p) => ({ value: p.id, label: p.is_default ? `${p.name} (default)` : p.name }))

  const conflicts = useMemo(() => findConflicts(rows), [rows])

  function update(key: string, patch: Partial<Row>) {
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
      const { data } = await api.put<{ data: Station }>(`/stations/${station.slug}/autodj-slots`, {
        timezone: timezone === "" ? null : timezone,
        slots: rows.map((row) => ({
          label: row.label.trim() === "" ? null : row.label.trim(),
          playlist_id: row.playlistId,
          days: row.days,
          start_time: row.start_time,
          end_time: row.end_time,
        })),
      })
      setRows((data.data.autodj_slots ?? []).map(toRow))
      setProgramme(data.data.programme ?? null)
      toast.success("Schedule saved", {
        description: "Takes effect at the next track boundary — nothing restarts.",
      })
      router.refresh()
    } catch (error) {
      const errors = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      toast.error(Object.values(errors?.errors ?? {})[0]?.[0] ?? errors?.message ?? "Couldn't save the schedule")
    } finally {
      setSaving(false)
    }
  }

  const onNow = programme ? describeProgramme(programme, timezone || null, defaultPlaylist?.name ?? null) : null

  const stripSlots: StripSlot[] = rows.map((row) => ({
    key: row.key,
    playlistId: row.playlistId,
    label: row.label === "" ? null : row.label,
    days: row.days,
    start_time: row.start_time,
    end_time: row.end_time,
  }))

  return (
    <div className="flex flex-col gap-6">
      {onNow && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <IconClockPlay size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">On now</div>
            <div className="text-sm">
              <span className="font-medium">{onNow.now}</span>
              {onNow.detail && <span className="text-muted-foreground"> · {onNow.detail}</span>}
            </div>
          </div>
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="autodj-timezone">Timezone</FieldLabel>
        <TimezoneCombobox id="autodj-timezone" value={timezone} onChange={setChosen} />
        <FieldDescription>
          The clock your slots are written in. Shared with your show times.
        </FieldDescription>
      </Field>

      <div className="flex flex-col gap-4">
        {rows.map((row) => {
          const clashing = conflicts.has(row.key)
          const overnight = row.start_time !== "" && row.end_time !== "" && minutes(row.end_time) <= minutes(row.start_time)
          return (
            <div
              key={row.key}
              className={cn(
                "flex flex-col gap-2.5 rounded-lg border p-3",
                clashing ? "border-destructive/60" : "border-border/60",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => update(row.key, { label: e.target.value })}
                  placeholder="Label (optional)"
                  maxLength={60}
                  className="flex-1 min-w-[160px]"
                />
                <Select
                  aria-label="Playlist"
                  value={row.playlistId}
                  onChange={(value) => update(row.key, { playlistId: value })}
                  options={playlistOptions}
                  className="w-48"
                />
                <div className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    value={row.start_time}
                    onChange={(e) => update(row.key, { start_time: e.target.value })}
                    className="w-28 shrink-0"
                    aria-label="Start time"
                  />
                  <span className="text-muted-foreground text-xs">→</span>
                  <Input
                    type="time"
                    value={row.end_time}
                    onChange={(e) => update(row.key, { end_time: e.target.value })}
                    className="w-28 shrink-0"
                    aria-label="End time"
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

              <div className="flex flex-wrap items-center gap-1.5">
                {DAY_INITIALS.map((initial, day) => {
                  const on = row.days.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_NAMES[day]}
                      onClick={() => toggleDay(row.key, day)}
                      className={`size-8 cursor-pointer rounded-full border text-xs transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {initial}
                    </button>
                  )
                })}
                {clashing && (
                  <span className="ml-2 text-xs text-destructive">Overlaps another slot.</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

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
          disabled={locked || playlists.length === 0}
          title={locked ? "Scheduling is part of AutoDJ, which isn't in your plan." : undefined}
        >
          <IconPlus data-icon="inline-start" />
          Add slot
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save schedule"}
        </Button>
      </div>

      <div className="rounded-lg border border-border/60 p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">This week</div>
        <WeekStrip
          slots={stripSlots}
          playlists={playlists.map((p) => ({ id: p.id, name: p.name }))}
          defaultName={defaultPlaylist?.name ?? "Default"}
          conflicts={conflicts}
        />
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
        Slots change what AutoDJ plays. They don&apos;t turn the station on or off, and a live broadcast
        always takes over. Outside every slot, {defaultPlaylist?.name ?? "the default playlist"} plays. A
        slot switches at the next track boundary, never mid-song, so it can start a few minutes late.
        Days are when the slot starts — a Friday 22:00–02:00 slot stays under Friday.
      </p>
    </div>
  )
}
