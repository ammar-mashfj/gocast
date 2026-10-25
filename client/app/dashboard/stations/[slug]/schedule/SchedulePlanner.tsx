"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { toast } from "sonner"
import { IconArrowsMaximize, IconArrowsMinimize, IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { Dialog, DialogContent } from "@/components/ds/Dialog"
import { Notice } from "@/components/ds/Notice"
import { PageHeader } from "@/components/ds/PageHeader"
import { ProTag } from "@/components/ds/Tag"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { AutoDjSettingsButton } from "@/components/dashboard/autodj/AutoDjSettingsButton"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useMounted } from "@/hooks/useMounted"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/interfaces/Playlist"
import type { Programme, Station } from "@/interfaces/Station"
import { AutoDjUpsell } from "../library/AutoDjUpsell"
import { DayList } from "./DayList"
import { LeaveGuard } from "./LeaveGuard"
import { ScheduleNow } from "./ScheduleNow"
import { SlotPanel } from "./SlotPanel"
import { TimezoneDialog } from "./TimezoneDialog"
import { DAY_SHORT, SWATCHES, WeekGrid } from "./WeekGrid"
import { GAP_DOT, swatchForPlaylist } from "@/lib/playlistSwatches"
import {
  DAY_MINUTES,
  explode,
  clashesWith,
  findOverlaps,
  freeSpanAt,
  fromSpan,
  merge,
  newKey,
  signature,
  snapshot,
  type Block,
} from "./weekModel"

interface Props {
  station: Station
  playlists: Playlist[]
}

type SaveState = "saved" | "pending" | "saving" | "overlap" | "error" | "no-timezone"

/**
 * Weekday and minute-of-day on the station's clock, or null when this browser
 * does not know the zone (the API checks against PHP's list, which can run
 * ahead of the browser's). The now line and banner then simply stay off,
 * as they do before mount, instead of the page failing.
 */
function stationNow(timeZone: string): { day: number; minute: number; label: string } | null {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date())
  } catch {
    return null
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const day = DAY_SHORT.indexOf(get("weekday"))
  const hour = parseInt(get("hour"), 10)
  const minute = parseInt(get("minute"), 10)
  return {
    day,
    minute: hour * 60 + minute,
    label: `${get("weekday").toUpperCase()} ${get("hour")}:${get("minute")}`,
  }
}

/**
 * What AutoDJ plays, drawn as a week you edit directly.
 *
 * The week IS the editor: drag along an empty stretch to add a slot, drag
 * an edge to change one day, open a slot for the panel to change every day it
 * runs.
 * Nothing saves until Save is pressed, then as the same full-list PUT as
 * before — see weekModel for how blocks become rows.
 *
 * The station timezone is edited here (TimezoneDialog), its only editor: only
 * AutoDJ depends on it.
 *
 * Below `md` the grid gives way to the phone layout the Android app uses, a
 * day strip and the chosen day's rows (DayList); the blocks, the dialog and
 * Save are the same, so a schedule started on a phone finishes on a laptop.
 *
 * See docs/features/schedule.md.
 */
export function SchedulePlanner({ station, playlists }: Props) {
  const locked = useAutoDjLocked()
  const mounted = useMounted()
  const [timezone, setTimezone] = useState(station.timezone)
  const [zoneOpen, setZoneOpen] = useState(false)

  const [blocks, setBlocks] = useState<Block[]>(() => explode(station.autodj_slots ?? []))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  /**
   * A slot being added: the blocks as they were before it, so backing out of
   * its dialog (Cancel, ×, Escape, a tap outside) puts them back as if Add
   * was never pressed, rather than leaving an unsaved slot behind.
   */
  const [adding, setAdding] = useState<{ before: Block[] } | null>(null)
  const [programme, setProgramme] = useState<Programme | null>(station.programme ?? null)

  const [saved, setSaved] = useState(() => snapshot(blocks))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const overlaps = useMemo(() => findOverlaps(blocks), [blocks])
  const current = snapshot(blocks)
  const dirty = current !== saved

  // ── Names and colours ──
  const defaultPlaylist = playlists.find((p) => p.is_default) ?? null
  // Every station is created with a default playlist, so this is the odd
  // case; without one a slot has nothing to play, and drawing one would
  // silently do nothing.
  const noPlaylists = playlists.length === 0
  const playlistsHref = `/dashboard/stations/${station.slug}/playlists`
  const byId = useMemo(() => new Map(playlists.map((p, i) => [p.id, { p, swatch: swatchForPlaylist(p, i) }])), [playlists])
  const swatchFor = useCallback((id: string) => byId.get(id)?.swatch ?? SWATCHES[0], [byId])
  const nameFor = useCallback((b: Block) => b.label.trim() || byId.get(b.playlistId)?.p.name || "Slot", [byId])

  // ── Selection ──
  const selected = blocks.find((b) => b.key === selectedKey) ?? null
  const group = useMemo(
    () => (selected ? blocks.filter((b) => signature(b) === signature(selected)) : []),
    [blocks, selected],
  )
  const siblings = useMemo(() => new Set(group.map((b) => b.key)), [group])

  // ── The station clock, for the now line and the banner ──
  const [now, setNow] = useState<ReturnType<typeof stationNow>>(null)
  useEffect(() => {
    if (!timezone) return
    const tick = () => setNow(stationNow(timezone))
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [timezone])

  // ── Saving ──
  async function save(): Promise<boolean> {
    const sending = blocks
    setSaving(true)
    setSaveError(null)
    try {
      const { data } = await api.put<{ data: Station }>(`/stations/${station.slug}/autodj-slots`, {
        // No `timezone`: TimezoneDialog saves it on its own, and the API
        // keeps the station's when this is omitted.
        slots: merge(sending),
      })
      setSaved(snapshot(sending))
      setProgramme(data.data.programme ?? null)
      toast.success("Schedule saved", {
        // The next song was picked when this one started (request.dynamic
        // prefetch), so the new schedule begins with the one after it.
        description: "Starts after the next song.",
      })
      return true
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      setSaveError(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? "Couldn't save your schedule.")
      return false
    } finally {
      setSaving(false)
    }
  }

  const blockedBy: SaveState | null = overlaps.size > 0 ? "overlap" : blocks.length > 0 && !timezone ? "no-timezone" : null

  // A reload or closed tab would drop whatever hasn't saved yet.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // The "right now" line goes stale when the current slot ends; ask again then.
  useEffect(() => {
    if (locked || !programme?.until) return
    const wait = new Date(programme.until).getTime() - Date.now() + 5_000
    if (wait <= 0 || wait > 24 * 60 * 60 * 1000) return
    const id = setTimeout(() => {
      api
        .get<{ data: Station }>(`/stations/${station.slug}`)
        .then(({ data }) => setProgramme(data.data.programme ?? null))
        .catch(() => {})
    }, wait)
    return () => clearTimeout(id)
  }, [locked, programme, station.slug])

  const saveState: SaveState = blockedBy ?? (saveError ? "error" : saving ? "saving" : dirty ? "pending" : "saved")

  // ── Edits ──
  function edit(next: Block[]) {
    setBlocks(next)
    setSaveError(null)
  }

  function create(day: number, span: [number, number]) {
    const playlist = playlists.find((p) => !p.is_default) ?? playlists[0]
    if (!playlist) return
    const block = fromSpan(
      { key: newKey(), day, playlistId: playlist.id, label: "", start: "00:00", end: "00:00", startMode: "soft" },
      span[0],
      span[1],
    )
    setAdding({ before: blocks })
    edit([...blocks, block])
    setSelectedKey(block.key)
  }

  /**
   * Close the slot dialog. `keep` false on a slot being added drops it (the
   * blocks go back to how they were); an existing slot's edits were applied
   * as they were made, so closing just closes.
   */
  function closeSlot(keep: boolean) {
    if (adding && !keep) setBlocks(adding.before)
    setAdding(null)
    setSelectedKey(null)
  }

  function addFromButton() {
    // The next free two hours from now on the station's clock, or Monday
    // morning when there is no clock yet.
    const start = now ?? { day: 1, minute: 6 * 60 }
    for (let offset = 0; offset < 7 * 24; offset++) {
      const at = start.day * DAY_MINUTES + Math.ceil(start.minute / 60) * 60 + offset * 60
      const day = Math.floor(at / DAY_MINUTES) % 7
      const span = freeSpanAt(blocks, day, at % DAY_MINUTES)
      if (span) return create(day, span)
    }
  }

  function changeOne(block: Block) {
    edit(blocks.map((b) => (b.key === block.key ? block : b)))
  }

  function changeGroup(patch: Partial<Pick<Block, "label" | "playlistId" | "start" | "end" | "startMode">>) {
    if (!selected) return
    edit(blocks.map((b) => (siblings.has(b.key) ? { ...b, ...patch } : b)))
  }

  function toggleDay(day: number) {
    if (!selected) return
    const onDay = group.find((b) => b.day === day)
    if (onDay) {
      if (group.length === 1) return // the last day goes through Delete
      edit(blocks.filter((b) => b.key !== onDay.key))
      if (onDay.key === selected.key) setSelectedKey(group.find((b) => b.key !== onDay.key)?.key ?? null)
      return
    }
    edit([...blocks, { ...selected, key: newKey(), day }])
  }

  function removeGroup() {
    edit(blocks.filter((b) => !siblings.has(b.key)))
    setSelectedKey(null)
  }

  const saveLine: Record<SaveState, { text: string; tone: "ok" | "warn" | "muted" }> = {
    saved: { text: "All saved", tone: "ok" },
    pending: { text: "Unsaved changes", tone: "warn" },
    saving: { text: "Saving…", tone: "muted" },
    overlap: { text: "Not saved: slots overlap", tone: "warn" },
    error: { text: "Not saved", tone: "warn" },
    "no-timezone": { text: "Not saved: no timezone", tone: "warn" },
  }
  const line = saveLine[saveState]
  // From md, Save and its status sit in the week card's header (the page
  // fits the window, so they never scroll away). On a phone the header has
  // them, and a bar pinned to the foot takes over while there is something
  // to save, since the day list scrolls the header away.
  const phoneBar = !locked && (dirty || Boolean(saveError))
  const headerOnly = phoneBar ? "hidden" : "md:hidden"
  const saveLamp = (className?: string) => !locked && (
    <span role="status" className={cn("inline-flex items-center gap-2 eyebrow", className, line.tone === "ok" ? "text-ok" : line.tone === "warn" ? "text-fault-text" : "text-muted-foreground")}>
      <span aria-hidden className="size-1.75 rounded-full bg-current" />
      {line.text}
    </span>
  )
  const saveButton = (className?: string) => !locked && (
    <Button className={className} onClick={() => void save()} disabled={!dirty || saving || blockedBy !== null}>
      {saving ? "Saving…" : "Save"}
    </Button>
  )

  // ── Expanded grid ──
  // The grid over the whole window, above the dashboard chrome. Not the
  // browser's Fullscreen API: only the fullscreen element is drawn, and the
  // slot dialog and toasts are portalled to <body>, so they'd vanish.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      // An open dialog takes Escape first.
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    // Below md there is no grid, only the day list: leave the expanded view.
    const wide = window.matchMedia("(min-width: 48rem)")
    const onWidth = () => !wide.matches && setExpanded(false)
    wide.addEventListener("change", onWidth)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      wide.removeEventListener("change", onWidth)
      document.body.style.overflow = overflow
    }
  }, [expanded])

  const usedPlaylists = playlists.filter((p) => !p.is_default && blocks.some((b) => b.playlistId === p.id))

  const weekGrid = (fill: boolean) => (
    <WeekGrid
      blocks={locked ? [] : blocks}
      swatchFor={swatchFor}
      nameFor={nameFor}
      selectedKey={selectedKey}
      siblings={siblings}
      overlaps={overlaps}
      now={mounted && now ? { day: now.day, minute: now.minute } : null}
      readOnly={locked || noPlaylists}
      onSelect={setSelectedKey}
      onCreate={create}
      onChange={changeOne}
      fill={fill}
      fitWindow={!fill}
    />
  )

  // The grid's legend; the day list spells each row out instead.
  const legend = (className: string) => (
    <div className={cn("flex-wrap items-center gap-x-4.5 gap-y-1.5 text-body-sm text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={cn("size-3 rounded-swatch", GAP_DOT)} />
        {locked ? "Off air unless you're live" : `${defaultPlaylist?.name ?? "Default playlist"} fills the gaps`}
      </span>
      {usedPlaylists.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-2">
          <span aria-hidden className={cn("size-3 rounded-swatch", swatchFor(p.id).dot)} style={swatchFor(p.id).dotStyle} />
          {p.name}
        </span>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-5.5">
      <PageHeader
        title="Schedule"
        aside={locked ? <ProTag /> : <HelpLink article="schedule-playlists-by-time" label="scheduling playlists by day and time" />}
        description="What AutoDJ plays when you’re not live. Going live always takes over."
        // Phones: status and timezone on one line, then Add slot growing to
        // fill the row beside Save (or the whole row while the bottom bar
        // carries Save).
        actionsClassName="max-sm:w-full"
        actions={
          <>
            {saveLamp(headerOnly)}
            {/* No zone is the notice below's job; saying it here too made three. */}
            {(timezone || locked) && <span className="inline-flex items-center gap-2 font-mono text-caption tracking-widest text-text-faint uppercase">
              {timezone ?? "No timezone"}
              {!locked && (
                <button type="button" onClick={() => setZoneOpen(true)} className="cursor-pointer font-sans text-body-sm font-semibold tracking-normal text-violet-muted normal-case hover:underline">
                  {timezone ? "Change" : "Set timezone"}
                </button>
              )}
            </span>}
            <span aria-hidden className="h-0 basis-full sm:hidden" />
            <AutoDjSettingsButton station={station} className="max-sm:flex-1" />
            {!locked && (
              <Button
                variant="ghost"
                className="max-sm:flex-1"
                onClick={addFromButton}
                disabled={noPlaylists}
                title={noPlaylists ? "Make a playlist in Playlists first." : undefined}
              >
                <IconPlus />
                Add slot
              </Button>
            )}
            {saveButton(headerOnly)}
          </>
        }
      />
      <ScheduleNow slug={station.slug} locked={locked} programme={programme} timezone={timezone} defaultName={defaultPlaylist?.name ?? null} />

      {locked && <AutoDjUpsell stationName={station.name} />}

      {saveState === "error" && <Notice label="Not saved">{saveError}</Notice>}
      {/* Every slot time is read on the station's clock, so a missing zone
          is shown up front, not only once a save is refused. */}
      {!locked && !timezone && (
        <section role="alert" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-panel bg-fault-tint px-5 py-4 text-fault-text">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-body font-bold">Your station has no timezone</h2>
            <p className="text-body-sm text-pretty">Slot times run on your station’s clock, so slots can’t be saved until it has one.</p>
          </div>
          <Button onClick={() => setZoneOpen(true)}>Set timezone</Button>
        </section>
      )}

      <LeaveGuard
        dirty={!locked && dirty}
        blockedReason={
          blockedBy === "overlap"
            ? "Your changes can’t be saved while two slots overlap. Stay to fix them, or leave and lose them."
            : blockedBy === "no-timezone"
              ? "Your changes can’t be saved until the station has a timezone. Stay to set one, or leave and lose them."
              : null
        }
        onSave={save}
      />

      <TimezoneDialog
        open={zoneOpen}
        onOpenChange={setZoneOpen}
        slug={station.slug}
        current={timezone}
        onSaved={(saved) => {
          setTimezone(saved.timezone)
          setProgramme(saved.programme ?? null)
        }}
      />

      <Dialog open={selected !== null && !locked} onOpenChange={(open) => !open && closeSlot(false)}>
        {/* Wider from md: SlotPanel sets the playlists beside the fields. */}
        {/* No focus on open: the dialog's own autofocus put a caret in the
            Name field (and raised the phone keyboard) before anything was read. */}
        <DialogContent className="md:max-w-200" onOpenAutoFocus={(e) => e.preventDefault()}>
          {selected && (
            <SlotPanel
              key={selected.key}
              block={selected}
              days={group.map((b) => b.day)}
              isNew={adding !== null}
              overlapping={group.some((b) => overlaps.has(b.key))}
              clashes={clashesWith(blocks, group)}
              nameFor={nameFor}
              playlists={playlists}
              swatchFor={swatchFor}
              onChange={changeGroup}
              onToggleDay={toggleDay}
              onDone={() => closeSlot(true)}
              onCancel={() => closeSlot(false)}
              onDelete={removeGroup}
            />
          )}
        </DialogContent>
      </Dialog>

      <Card aria-labelledby="schedule-week">
        <CardHeader
          title={<span id="schedule-week">Every week</span>}
          aside={
            // From md, Save lives here rather than in a bar under the card:
            // the page fits the window, so this is always in view.
            <span className="hidden items-center gap-3 md:inline-flex">
              {/* Short, so it never wraps into a line of its own. */}
              {!locked && <span className="hidden text-body-sm text-text-faint xl:inline">Click or drag on the week to add a slot.</span>}
              <Button variant="ghost" size="sm" onClick={() => setExpanded(true)} title="Show the week across the whole window">
                <IconArrowsMaximize />
                Expand
              </Button>
              {saveLamp()}
              {saveButton()}
            </span>
          }
        />

        {/* Both are in the markup and CSS picks one, so a resize never
            loses the selection or the unsaved blocks. */}
        <div className="md:hidden">
          <DayList
            blocks={locked ? [] : blocks}
            playlists={playlists}
            swatchFor={swatchFor}
            nameFor={nameFor}
            overlaps={overlaps}
            now={mounted && now ? { day: now.day, minute: now.minute } : null}
            mounted={mounted}
            locked={locked}
            readOnly={locked || noPlaylists}
            onSelect={setSelectedKey}
            onCreate={create}
          />
        </div>
        <div className="hidden md:block">
          {/* One grid at a time: the expanded view below takes over. */}
          {!expanded && weekGrid(false)}
        </div>

        {legend("hidden md:flex")}

        {!locked && noPlaylists && (
          <p className="max-w-[62ch] text-body-sm text-muted-foreground">
            A slot plays a playlist, and this station has none yet.{" "}
            <Link href={playlistsHref} className="text-violet-muted hover:underline">Make one in Playlists</Link>, then come back to plan the week.
          </p>
        )}

      </Card>

      {expanded && (
        // z-40: over the sidebar and top bar (z-30 and under), under the
        // slot dialog and toasts (z-50), which still open on top of it.
        <div role="region" aria-label="Week schedule, expanded" className="fixed inset-0 z-40 hidden flex-col gap-4 bg-card p-5 md:flex">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="font-display text-title-sm">Every week</h2>
            {timezone && <span className="font-mono text-caption tracking-widest text-text-faint uppercase">{timezone}</span>}
            <span className="ml-auto flex items-center gap-2.5">
              {saveLamp()}
              {!locked && (
                <Button variant="ghost" onClick={addFromButton} disabled={noPlaylists}>
                  <IconPlus />
                  Add slot
                </Button>
              )}
              {saveButton()}
              <Button variant="subtle" onClick={() => setExpanded(false)} title="Back to the page (Esc)">
                <IconArrowsMinimize />
                Exit
              </Button>
            </span>
          </div>
          <div className="min-h-0 flex-1">{weekGrid(true)}</div>
          {legend("flex")}
        </div>
      )}

      {!locked && (
        <div className={cn("sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-panel bg-popover px-4.5 py-3 shadow-panel md:hidden", !phoneBar && "hidden")}>
          {saveLamp()}
          {saveButton()}
        </div>
      )}
    </div>
  )
}
