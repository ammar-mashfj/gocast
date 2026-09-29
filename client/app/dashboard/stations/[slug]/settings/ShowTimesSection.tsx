"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { useMounted } from "@/hooks/useMounted"
import type { Station } from "@/interfaces/Station"
import { TimezoneCombobox } from "../TimezoneCombobox"
import { ShowTimesEditor, toShowRow, type ShowRow } from "./ShowTimesEditor"

/** The rows as the server would store them — keys are client-only. */
function snapshot(rows: ShowRow[]): string {
  return JSON.stringify(rows.map((r) => [r.label.trim(), r.days, r.start_time]))
}

/**
 * Show times and the station clock, on every plan.
 *
 * This is the ONLY place the station timezone is edited. The Schedule page's
 * AutoDJ slots are written in the same clock and display it read-only with a
 * link back here. Two pickers used to exist, one per lane, and "whichever
 * saved last won" — so the zone lives with the one save that sends it.
 *
 * The zone rides on the show-times PUT (one transaction with the rows, see
 * ReplaceStationSchedulesRequest), so saving with no rows is how a Pro owner
 * who only uses AutoDJ slots sets it.
 */
export function ShowTimesSection({ station }: { station: Station }) {
  // Server-rendered page: the viewer's zone cannot be read while deciding the
  // first frame, or a station with a null timezone would hydrate with a
  // different value than it rendered.
  const mounted = useMounted()
  const [chosen, setChosen] = useState<string | null>(station.timezone)
  const timezone = chosen ?? (mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")

  const [rows, setRows] = useState<ShowRow[]>((station.schedules ?? []).map(toShowRow))
  const [savedRows, setSavedRows] = useState(() => snapshot(rows))
  const [savedTimezone, setSavedTimezone] = useState<string | null>(station.timezone)

  // A null zone shows the browser's in the field and the first save persists
  // it, but it is not flagged as a change: that would warn on every visit to
  // a station that never set one, for a value the owner did not touch.
  const timezoneDirty = chosen !== null && chosen !== savedTimezone
  const dirty = timezoneDirty || snapshot(rows) !== savedRows

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function onSaved(saved: Station) {
    setSavedRows(snapshot(rows))
    setSavedTimezone(saved.timezone)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground max-w-[62ch]">
        When you&apos;re usually live. They appear on your player page so listeners know when to
        come back. Nothing starts on its own: you still go live from the studio.
      </p>

      <Field className="max-w-md">
        <FieldLabel htmlFor="station-timezone">Station timezone</FieldLabel>
        <TimezoneCombobox id="station-timezone" value={timezone} onChange={setChosen} />
        <FieldDescription>
          Your show times and your{" "}
          <Link href={`/dashboard/stations/${station.slug}/schedule`} className="underline underline-offset-2">
            AutoDJ schedule
          </Link>{" "}
          are both written in this clock. Listeners see show times in their own.
        </FieldDescription>
        {timezoneDirty && (
          <FieldDescription role="status" className="text-foreground">
            Not saved yet. Press Save below to apply it.
          </FieldDescription>
        )}
      </Field>

      <ShowTimesEditor
        slug={station.slug}
        timezone={timezone}
        rows={rows}
        setRows={setRows}
        dirty={dirty}
        onSaved={onSaved}
      />
    </div>
  )
}
