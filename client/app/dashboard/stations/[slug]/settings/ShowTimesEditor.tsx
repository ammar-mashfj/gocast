"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import axios from "axios"
import api from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DayChip } from "../schedule/DayChip"
import { DAY_INITIALS, DAY_NAMES } from "../schedule/days"
import type { Station, StationSchedule } from "@/interfaces/Station"

export interface ShowRow {
  key: string
  label: string
  days: number[]
  start_time: string
}

export function toShowRow(schedule: StationSchedule): ShowRow {
  return {
    key: schedule.id,
    label: schedule.label ?? "",
    days: schedule.days,
    start_time: schedule.start_time,
  }
}

interface Props {
  slug: string
  /** Owned by the Schedule page, which shares one clock between both editors. */
  timezone: string
  rows: ShowRow[]
  setRows: Dispatch<SetStateAction<ShowRow[]>>
  /** Rows or timezone differ from what was last saved. */
  dirty: boolean
  /** The saved station, so the page can move its saved baseline. */
  onSaved: (station: Station) => void
}

/**
 * The owner's claim about when they are LIVE — a person at the mic.
 *
 * Advertising only: the rows are shown on the player page and read by nothing
 * that decides what plays (see docs/features/schedule.md). That is why this
 * lives in Station settings, beside the other things listeners see, and not
 * on the Schedule page. It used to sit there as a "When you're live" lane next
 * to AutoDJ's slots, and owners on Pro filled it in expecting it to program
 * the station.
 *
 * Drawn in the emerald live tone, never violet: violet means AutoDJ.
 *
 * Rows are held by ShowTimesSection, which also owns the station timezone.
 * Saved as one full-list PUT rather than per-row calls: the rows carry no
 * identity worth preserving and their order is the array's order.
 */
export function ShowTimesEditor({ slug, timezone, rows, setRows, dirty, onSaved }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  function update(key: string, patch: Partial<ShowRow>) {
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
    setRows((current) => [
      ...current,
      { key: `new-${Date.now()}`, label: "", days: [], start_time: "20:00" },
    ])
  }

  /**
   * The first thing the server would reject, said before asking it.
   *
   * Both of these save "successfully" as far as a row is concerned and then
   * render nowhere, which reads as the save having silently failed — and a
   * time input can be cleared to an empty string, so neither is hypothetical.
   */
  function firstProblem(): string | null {
    if (rows.length > 0 && timezone === "") return "Pick a timezone for your show times."
    if (rows.some((row) => row.days.length === 0)) return "Pick at least one day for every show time."
    if (rows.some((row) => row.start_time === "")) return "Every show time needs a start time."
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
      // One request carrying both halves. Split in two, a failure between
      // them would move the station's clock out from under times that never
      // saved — every advertised show hours out, reported as a failed save.
      const { data } = await api.put<{ data: Station }>(`/stations/${slug}/schedules`, {
        timezone: timezone === "" ? null : timezone,
        schedules: rows.map((row) => ({
          label: row.label.trim() === "" ? null : row.label.trim(),
          days: row.days,
          start_time: row.start_time,
        })),
      })

      onSaved(data.data)
      toast.success("Show times saved")
      router.refresh()
    } catch (error) {
      // Surface what the server actually objected to. A 422 names the row
      // and the field; swallowing it leaves the owner re-reading a form that
      // looks fine to them.
      const errors = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined

      toast.error(
        Object.values(errors?.errors ?? {})[0]?.[0] ?? errors?.message ?? "Couldn't save your show times",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {rows.length > 0 && (
        // Rows split by hairlines, not emerald boxes: the chips and the
        // "Live on" label carry the meaning.
        <ul className="m-0 flex list-none flex-col divide-y divide-white/[0.06] border-y border-white/[0.06] p-0">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-3 py-4">
              <div className="flex items-center gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => update(row.key, { label: e.target.value })}
                  placeholder="Show name, e.g. Sunday service (optional)"
                  aria-label="Show name (optional)"
                  maxLength={60}
                />
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => update(row.key, { start_time: e.target.value })}
                  className="w-36 shrink-0 font-mono tabular-nums"
                  aria-label="Start time"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  aria-label="Remove show time"
                >
                  <IconTrash size={16} />
                </Button>
              </div>

              <div role="group" aria-label="Days you're live" className="flex flex-wrap items-center gap-2">
                {/* basis-full below sm: seven 36px chips plus this label ran
                    past a 375px column and Saturday wrapped alone. */}
                <span className="mr-1 inline-flex basis-full items-center gap-1.5 text-xs text-muted-foreground sm:basis-auto">
                  <span className="size-1.5 rounded-full bg-live" aria-hidden="true" />
                  Live on
                </span>
                {DAY_INITIALS.map((initial, day) => (
                  <DayChip
                    key={day}
                    tone="live"
                    on={row.days.includes(day)}
                    label={DAY_NAMES[day]}
                    onToggle={() => toggleDay(row.key, day)}
                  >
                    {initial}
                  </DayChip>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Tell listeners when you&apos;re usually live and they can come back for it.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={addRow}>
          <IconPlus data-icon="inline-start" />
          Add show time
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && !saving && (
          <span role="status" className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </div>

      {/* The one ambiguity in the whole feature, said once rather than
          discovered: a show that starts at 22:00 and runs past midnight
          belongs to the day it STARTS. */}
      <p className="text-sm text-muted-foreground leading-relaxed max-w-[62ch]">
        Days are when the show starts, so a Sunday 11pm show stays under Sunday.
      </p>
    </div>
  )
}
