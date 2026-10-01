"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import axios from "axios"
import api from "@/lib/axios"
import { Button } from "@/components/ds/Button"
import { DayToggle } from "@/components/ds/DayToggle"
import { Input } from "@/components/ds/Field"
import { DAY_NAMES } from "../schedule/days"
import { WEEK_ORDER } from "../schedule/WeekGrid"
import type { Station, StationSchedule } from "@/interfaces/Station"

/** Monday-first names for the day chips; indexes map through WEEK_ORDER. */
const WEEK_LABELS = WEEK_ORDER.map((d) => DAY_NAMES[d])

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
 * Neutral off-white day chips: not violet (AutoDJ) and not red (live right
 * now) — a show time is a promise, not something on air.
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
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          Nothing here yet. Tell listeners when you’re usually live and they can come back for it.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-3 rounded-well bg-surface-inset p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => update(row.key, { label: e.target.value })}
                  placeholder="Show name (optional)"
                  aria-label="Show name (optional)"
                  maxLength={60}
                  className="min-w-48 flex-1"
                />
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => update(row.key, { start_time: e.target.value })}
                  className="w-36 font-mono tabular-nums"
                  aria-label="Start time"
                />
                <Button
                  variant="quiet"
                  size="icon"
                  className="ml-auto"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  aria-label={`Remove ${row.label.trim() || "show time"}`}
                >
                  <IconTrash />
                </Button>
              </div>
              <DayToggle
                aria-label="Days you’re live"
                tone="neutral"
                size="sm"
                stretch
                labels={WEEK_LABELS}
                value={row.days.map((d) => WEEK_ORDER.indexOf(d)).sort((a, b) => a - b)}
                onChange={(picked) => update(row.key, { days: picked.map((i) => WEEK_ORDER[i]).sort((a, b) => a - b) })}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="subtle" onClick={addRow}>
          <IconPlus />
          Add show time
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && !saving && (
          <span role="status" className="text-body-sm text-fault-text">Unsaved changes</span>
        )}
      </div>

      {/* The one ambiguity in the whole feature, said once rather than
          discovered: a show that starts at 22:00 and runs past midnight
          belongs to the day it STARTS. */}
      <p className="text-body-sm text-text-faint">Days are when the show starts, so a Sunday 11pm show stays under Sunday.</p>
    </div>
  )
}
