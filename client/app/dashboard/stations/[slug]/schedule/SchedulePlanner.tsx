"use client"

import { useEffect, useMemo, useState } from "react"
import { IconClockPlay } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { useMounted } from "@/hooks/useMounted"
import { describeProgramme } from "@/lib/programme"
import api from "@/lib/axios"
import type { Playlist } from "@/interfaces/Playlist"
import type { Programme, Station } from "@/interfaces/Station"
import { TimezoneCombobox } from "../TimezoneCombobox"
import { AutodjSlotsEditor, findConflicts, toSlotRow, type SlotRow } from "./AutodjSlotsEditor"
import { ShowTimesEditor, toShowRow, type ShowRow } from "./ShowTimesEditor"
import { WeekStrip } from "./WeekStrip"

interface Props {
  station: Station
  playlists: Playlist[]
}

/**
 * The station's week, in one place.
 *
 * Two things used to be scheduled on two pages: show times (when a person is
 * live, advertised to listeners) in Station settings, and AutoDJ slots (which
 * playlist plays when nobody is) under AutoDJ. They shared one timezone that
 * could be edited in both, and a volunteer couldn't tell which of the two
 * controlled Sunday service. Now there is one week strip drawing both, one
 * clock, and two clearly different lanes underneath: emerald for a person,
 * violet for AutoDJ.
 *
 * The lanes keep their own saves because they are two endpoints with two
 * validation stories — a clash between AutoDJ slots is an error, a show time
 * can sit anywhere — and one button saving both would report one lane's 422
 * as the other's failure. Both send the timezone, so whichever saves last
 * wins, and there is only one field to set it from. Because either save moves
 * the clock under BOTH lanes, an unsaved timezone says so, and each lane says
 * when it has changes the other lane's button won't save.
 */

/** A lane's rows as the server would store them — keys are client-only. */
function showSnapshot(rows: ShowRow[]): string {
  return JSON.stringify(rows.map((r) => [r.label.trim(), r.days, r.start_time]))
}
function slotSnapshot(rows: SlotRow[]): string {
  return JSON.stringify(rows.map((r) => [r.label.trim(), r.playlistId, r.days, r.start_time, r.end_time]))
}
export function SchedulePlanner({ station, playlists }: Props) {
  const locked = useAutoDjLocked()
  const proRequest = useProRequest()

  // Server-rendered page: the viewer's zone cannot be read while deciding the
  // first frame. The server would resolve the container's zone (UTC) and the
  // browser the reader's, and every station with a null timezone would
  // hydrate with a different value than it rendered.
  const mounted = useMounted()
  const [chosen, setChosen] = useState<string | null>(station.timezone)
  const timezone = chosen ?? (mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")

  const [showRows, setShowRows] = useState<ShowRow[]>((station.schedules ?? []).map(toShowRow))
  const [slotRows, setSlotRows] = useState<SlotRow[]>((station.autodj_slots ?? []).map(toSlotRow))
  const [programme, setProgramme] = useState<Programme | null>(station.programme ?? null)
  const conflicts = useMemo(() => findConflicts(slotRows), [slotRows])

  // What the server holds, to tell an edited lane from a saved one.
  const [savedTimezone, setSavedTimezone] = useState<string | null>(station.timezone)
  const [savedShows, setSavedShows] = useState(() => showSnapshot(showRows))
  const [savedSlots, setSavedSlots] = useState(() => slotSnapshot(slotRows))
  // A null station timezone shows the browser's zone in the field. Both lane
  // saves send whatever the field shows, so the first save persists it — but
  // it is not flagged as a change: flagging it would put "Unsaved changes"
  // and a leave-page warning on every visit to a station that has never set
  // one, for a value the owner did not touch. Only a zone the owner picked
  // counts as dirty.
  const timezoneDirty = chosen !== null && chosen !== savedTimezone
  const showsDirty = timezoneDirty || showSnapshot(showRows) !== savedShows
  const slotsDirty = !locked && (timezoneDirty || slotSnapshot(slotRows) !== savedSlots)

  // A reload or closed tab would drop the lane nobody saved.
  useEffect(() => {
    if (!showsDirty && !slotsDirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [showsDirty, slotsDirty])

  function onShowsSaved(saved: Station) {
    setSavedShows(showSnapshot(showRows))
    if (saved.timezone !== savedTimezone && !locked) {
      // The clock moved under the AutoDJ slots too, so which one is on now
      // may have changed. The show-times response doesn't resolve it.
      api
        .get<{ data: Station }>(`/stations/${station.slug}`)
        .then(({ data }) => setProgramme(data.data.programme ?? null))
        .catch(() => {})
    }
    setSavedTimezone(saved.timezone)
  }

  function onSlotsSaved(saved: Station) {
    setSavedSlots(slotSnapshot((saved.autodj_slots ?? []).map(toSlotRow)))
    setSavedTimezone(saved.timezone)
    setProgramme(saved.programme ?? null)
  }

  const defaultPlaylist = playlists.find((p) => p.is_default) ?? null
  const onNow =
    !locked && programme ? describeProgramme(programme, timezone || null, defaultPlaylist?.name ?? null) : null

  return (
    <div className="flex flex-col gap-8">
      {onNow && (
        // A line on the sheet, not a box: it is a reading, not something to edit.
        <div className="flex items-center gap-3">
          <span className="size-9 rounded-md bg-on-air/10 text-on-air flex items-center justify-center shrink-0">
            <IconClockPlay size={18} />
          </span>
          <div className="min-w-0">
            {/* "Playing now" would be wrong while someone is live: this is the
                playlist AutoDJ has lined up, which live takes over from. */}
            <div className="text-xs text-muted-foreground">AutoDJ&apos;s playlist right now</div>
            <div className="text-sm">
              <span className="font-medium">{onNow.now}</span>
              {onNow.detail && <span className="text-muted-foreground"> · {onNow.detail}</span>}
            </div>
          </div>
        </div>
      )}

      {/* The week first, as the summary of both lanes below. It reads the
          unsaved rows of both, so it moves as either is edited. */}
      <section aria-labelledby="schedule-week" className="flex flex-col gap-3">
        <h2 id="schedule-week" className="text-sm font-medium">This week</h2>
        <WeekStrip
          slots={locked ? [] : slotRows}
          playlists={playlists.map((p) => ({ id: p.id, name: p.name }))}
          defaultName={defaultPlaylist?.name ?? "Default"}
          conflicts={conflicts}
          shows={showRows.map((row) => ({
            key: row.key,
            label: row.label === "" ? null : row.label,
            days: row.days,
            start_time: row.start_time,
          }))}
          gapLabel={locked ? "Off air unless you're live" : undefined}
        />
      </section>

      <Field className="max-w-md">
        <FieldLabel htmlFor="schedule-timezone">Timezone</FieldLabel>
        <TimezoneCombobox id="schedule-timezone" value={timezone} onChange={setChosen} />
        <FieldDescription>
          The clock everything on this page is written in. Listeners see your show times in
          their own.
        </FieldDescription>
        {timezoneDirty && (
          <FieldDescription role="status" className="text-foreground">
            {locked
              ? "Not saved yet. Save your show times to apply it."
              : "Not saved yet. Saving either section below applies it to both your show times and your AutoDJ slots."}
          </FieldDescription>
        )}
      </Field>

      <section
        aria-labelledby="schedule-live"
        className="flex flex-col gap-4 border-t border-white/[0.07] pt-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="schedule-live" className="flex items-center gap-2 text-base font-semibold">
            <span className="size-2 rounded-full bg-live" aria-hidden="true" />
            When you&apos;re live
          </h2>
          <p className="text-sm text-muted-foreground max-w-[62ch]">
            Your regular shows. They appear on your player page so listeners know when to come back.
          </p>
        </div>
        <ShowTimesEditor
          slug={station.slug}
          timezone={timezone}
          rows={showRows}
          setRows={setShowRows}
          dirty={showsDirty}
          onSaved={onShowsSaved}
        />
      </section>

      <section
        aria-labelledby="schedule-autodj"
        className="flex flex-col gap-4 border-t border-white/[0.07] pt-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="schedule-autodj" className="flex items-center gap-2 text-base font-semibold">
            <span className="size-2 rounded-full bg-on-air" aria-hidden="true" />
            What AutoDJ plays
            {locked ? (
              // Inline in the heading, per DESIGN.md's plan-tag rule.
              <Badge variant="pro">
                Pro
              </Badge>
            ) : (
              <HelpLink article="schedule-playlists-by-time" label="scheduling playlists by day and time" />
            )}
          </h2>
          <p className="text-sm text-muted-foreground max-w-[62ch]">
            When you&apos;re not live, AutoDJ plays your music. Pick a different playlist for
            certain hours, like calm music overnight. Going live always takes over.
          </p>
        </div>

        {locked ? (
          <div>
            {/* Outline: the lane's own saves are the filled buttons on this
                page. "Request", not "Upgrade" — Pro is granted by hand. */}
            <Button variant="outline" onClick={proRequest.open} disabled={proRequest.requested}>
              {proRequest.requested ? "Request sent" : "Request Pro"}
            </Button>
          </div>
        ) : (
          <AutodjSlotsEditor
            slug={station.slug}
            playlists={playlists}
            timezone={timezone}
            rows={slotRows}
            setRows={setSlotRows}
            conflicts={conflicts}
            dirty={slotsDirty}
            onSaved={onSlotsSaved}
          />
        )}
      </section>
    </div>
  )
}
