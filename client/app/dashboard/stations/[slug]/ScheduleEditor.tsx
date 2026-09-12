"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import axios from "axios"
import api from "@/lib/axios"
import { useMounted } from "@/hooks/useMounted"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { TimezoneCombobox } from "./TimezoneCombobox"
import type { Station, StationSchedule } from "@/interfaces/Station"

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface Row {
  key: string
  label: string
  days: number[]
  start_time: string
}

function toRow(schedule: StationSchedule): Row {
  return {
    key: schedule.id,
    label: schedule.label ?? "",
    days: schedule.days,
    start_time: schedule.start_time,
  }
}

/**
 * The owner's claim about when they are on air.
 *
 * Saved as one full-list PUT rather than per-row calls: the rows carry no
 * identity worth preserving and their order is the array's order, so a diff
 * would be machinery in exchange for nothing.
 */
export function ScheduleEditor({ station }: { station: Station }) {
  const router = useRouter()

  // The settings page IS server-rendered, unlike the player, so the viewer's
  // zone cannot be read while deciding the first frame: the server would
  // resolve the container's zone (UTC) and the browser the reader's, and
  // every station with a null timezone — which is all of them, the column
  // being new — would hydrate with a different value than it rendered.
  const mounted = useMounted()
  const [chosen, setChosen] = useState<string | null>(station.timezone)
  const timezone = chosen ?? (mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")

  const [rows, setRows] = useState<Row[]>((station.schedules ?? []).map(toRow))
  const [saving, setSaving] = useState(false)

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
    if (rows.length > 0 && timezone === "") {
      return "Pick a timezone for your show times."
    }

    if (rows.some((row) => row.days.length === 0)) {
      return "Pick at least one day for every show time."
    }

    if (rows.some((row) => row.start_time === "")) {
      return "Every show time needs a start time."
    }

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
      await api.put(`/stations/${station.slug}/schedules`, {
        timezone: timezone === "" ? null : timezone,
        schedules: rows.map((row) => ({
          label: row.label.trim() === "" ? null : row.label.trim(),
          days: row.days,
          start_time: row.start_time,
        })),
      })

      toast.success("Schedule saved")
      router.refresh()
    } catch (error) {
      // Surface what the server actually objected to. A 422 names the row
      // and the field; swallowing it leaves the owner re-reading a form that
      // looks fine to them.
      const errors = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined

      toast.error(
        Object.values(errors?.errors ?? {})[0]?.[0] ?? errors?.message ?? "Couldn't save the schedule",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="station-timezone">Timezone</FieldLabel>
        <TimezoneCombobox id="station-timezone" value={timezone} onChange={setChosen} />
        <FieldDescription>
          The clock your show times are written in. Listeners see them converted to their own.
        </FieldDescription>
      </Field>

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2.5 rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Input
                value={row.label}
                onChange={(e) => update(row.key, { label: e.target.value })}
                placeholder="Show name (optional)"
                maxLength={60}
              />
              <Input
                type="time"
                value={row.start_time}
                onChange={(e) => update(row.key, { start_time: e.target.value })}
                className="w-32 shrink-0"
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
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Tell listeners when you&apos;re usually on and they can come back for it.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={addRow}>
          <IconPlus data-icon="inline-start" />
          Add show time
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save schedule"}
        </Button>
      </div>

      {/* The one ambiguity in the whole feature, said once rather than
          discovered: a show that starts at 22:00 and runs past midnight
          belongs to the day it STARTS. */}
      <p className="text-xs text-text-faint">
        Days are when the show starts — a Sunday 11pm show stays under Sunday.
      </p>
    </div>
  )
}
