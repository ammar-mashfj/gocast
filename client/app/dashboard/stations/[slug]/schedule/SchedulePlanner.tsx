"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { toast } from "sonner"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { Dialog, DialogContent } from "@/components/ds/Dialog"
import { Notice } from "@/components/ds/Notice"
import { PageHeader } from "@/components/ds/PageHeader"
import { AutoDjSections } from "@/components/dashboard/autodj/AutoDjSections"
import { ProTag } from "@/components/ds/Tag"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useMounted } from "@/hooks/useMounted"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import { AutoDjUpsell } from "../library/AutoDjUpsell"
import { DayList } from "./DayList"
import { SlotPanel } from "./SlotPanel"
import { DAY_SHORT, SWATCHES, WEEK_ORDER, WeekGrid } from "./WeekGrid"
import { weekDates } from "./weekDates"
import {
  DAY_MINUTES,
  explode,
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
 * Show times are not edited here. They only tell listeners when you're on and
 * program nothing, so they live in Station settings with the timezone and are
 * drawn here as dashed marks: going live takes over from any slot.
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
  const timezone = station.timezone
  const settingsHref = `/dashboard/stations/${station.slug}/settings#show-times`

  const [blocks, setBlocks] = useState<Block[]>(() => explode(station.autodj_slots ?? []))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [newKeys, setNewKeys] = useState<Set<string>>(() => new Set())

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
  const byId = useMemo(() => new Map(playlists.map((p, i) => [p.id, { p, swatch: SWATCHES[i % SWATCHES.length] }])), [playlists])
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
  async function save() {
    const sending = blocks
    setSaving(true)
    setSaveError(null)
    try {
      await api.put(`/stations/${station.slug}/autodj-slots`, {
        // No `timezone`: it is set in Station settings, and the API keeps
        // the station's when this is omitted.
        slots: merge(sending),
      })
      setSaved(snapshot(sending))
      toast.success("Schedule saved", {
        description: "Takes effect when the current song ends. Nothing restarts.",
      })
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      setSaveError(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? "Couldn't save your schedule.")
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
    edit([...blocks, block])
    setNewKeys((keys) => new Set(keys).add(block.key))
    setSelectedKey(block.key)
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
  const saveLamp = !locked && (
    <span role="status" className={cn("inline-flex items-center gap-2 eyebrow", line.tone === "ok" ? "text-ok" : line.tone === "warn" ? "text-fault-text" : "text-muted-foreground")}>
      <span aria-hidden className="size-1.75 rounded-full bg-current" />
      {line.text}
    </span>
  )
  const saveButton = !locked && (
    <Button onClick={save} disabled={!dirty || saving || blockedBy !== null}>
      {saving ? "Saving…" : "Save"}
    </Button>
  )

  // Day labels' dates, on the station's calendar, for the grid.
  const dates = mounted
    ? Object.fromEntries(
        weekDates(timezone).map((d, i) => [WEEK_ORDER[i], d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()]),
      )
    : undefined
  const usedPlaylists = playlists.filter((p) => !p.is_default && blocks.some((b) => b.playlistId === p.id))

  return (
    <div className="flex flex-col gap-5.5">
      <AutoDjSections slug={station.slug} />
      <PageHeader
        title="Schedule"
        aside={locked ? <ProTag /> : <HelpLink article="schedule-playlists-by-time" label="scheduling playlists by day and time" />}
        description="What AutoDJ plays when you’re not live. Going live always takes over."
        actions={
          <>
            {saveLamp}
            <span className="inline-flex items-center gap-2 font-mono text-caption tracking-widest text-text-faint uppercase">
              {timezone ?? "No timezone"}
              <Link href={settingsHref} className="font-sans text-body-sm font-semibold tracking-normal text-violet-muted normal-case hover:underline">
                {timezone ? "Change" : "Set timezone"}
              </Link>
            </span>
            {!locked && (
              <Button
                variant="ghost"
                onClick={addFromButton}
                disabled={noPlaylists}
                title={noPlaylists ? "Make a playlist in Playlists first." : undefined}
              >
                <IconPlus />
                Add slot
              </Button>
            )}
            {saveButton}
          </>
        }
      />

      {locked && <AutoDjUpsell stationName={station.name} />}

      {saveState === "error" && <Notice label="Not saved">{saveError}</Notice>}
      {saveState === "no-timezone" && (
        <Notice label="No timezone">
          Your station needs a timezone before slots can be saved.{" "}
          <Link href={settingsHref} className="underline underline-offset-2">Set it in Station settings</Link>.
        </Notice>
      )}


      <Dialog open={selected !== null && !locked} onOpenChange={(open) => !open && setSelectedKey(null)}>
        <DialogContent>
          {selected && (
            <SlotPanel
              key={selected.key}
              block={selected}
              days={group.map((b) => b.day)}
              isNew={newKeys.has(selected.key)}
              overlapping={group.some((b) => overlaps.has(b.key))}
              playlists={playlists}
              swatchFor={swatchFor}
              onChange={changeGroup}
              onToggleDay={toggleDay}
              onDone={() => setSelectedKey(null)}
              onDelete={removeGroup}
            />
          )}
        </DialogContent>
      </Dialog>

      <Card aria-labelledby="schedule-week">
        <CardHeader
          title={<span id="schedule-week">This week</span>}
          aside={!locked && <span className="hidden md:inline">Click an empty hour to add a slot, or drag to draw one. Click a slot to change it.</span>}
        />

        {/* Both are in the markup and CSS picks one, so a resize never
            loses the selection or the unsaved blocks. */}
        <div className="md:hidden">
          <DayList
            blocks={locked ? [] : blocks}
            shows={station.schedules ?? []}
            showsHref={settingsHref}
            playlists={playlists}
            swatchFor={swatchFor}
            nameFor={nameFor}
            overlaps={overlaps}
            now={mounted && now ? { day: now.day, minute: now.minute } : null}
            timezone={timezone}
            mounted={mounted}
            locked={locked}
            readOnly={locked || noPlaylists}
            onSelect={setSelectedKey}
            onCreate={create}
          />
        </div>
        <div className="hidden md:block">
          <WeekGrid
            blocks={locked ? [] : blocks}
            shows={station.schedules ?? []}
            showsHref={settingsHref}
            swatchFor={swatchFor}
            nameFor={nameFor}
            selectedKey={selectedKey}
            siblings={siblings}
            overlaps={overlaps}
            now={mounted && now ? { day: now.day, minute: now.minute } : null}
            dates={dates}
            readOnly={locked || noPlaylists}
            onSelect={setSelectedKey}
            onCreate={create}
            onChange={changeOne}
          />
        </div>

        {/* The grid's legend; the day list spells each row out instead. */}
        <div className="hidden flex-wrap items-center gap-x-4.5 gap-y-1.5 pt-1 text-body-sm text-muted-foreground md:flex">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-swatch border border-line-strong bg-surface-inset" />
            {locked ? "Off air unless you're live" : `${defaultPlaylist?.name ?? "Default playlist"} fills the gaps`}
          </span>
          {usedPlaylists.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2">
              <span aria-hidden className={cn("size-3 rounded-swatch", swatchFor(p.id).dot)} />
              {p.name}
            </span>
          ))}
          {(station.schedules ?? []).length > 0 && (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-swatch border-stroke border-dashed border-foreground/40" />
              Your show times ·{" "}
              <Link href={settingsHref} className="text-violet-muted hover:underline">edit</Link>
            </span>
          )}
        </div>

        {!locked && noPlaylists && (
          <p className="max-w-[62ch] text-body-sm text-muted-foreground">
            A slot plays a playlist, and this station has none yet.{" "}
            <Link href={playlistsHref} className="text-violet-muted hover:underline">Make one in Playlists</Link>, then come back to plan the week.
          </p>
        )}

        {!locked && (
          <p className="max-w-[62ch] text-body-sm text-text-faint">
            Slots switch at the next song break, so one can start a minute or two late, unless it is set to start exactly on time.
          </p>
        )}
      </Card>

      {!locked && (dirty || saveError) && (
        <div className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-panel bg-popover px-4.5 py-3 shadow-panel md:hidden">
          {saveLamp}
          {saveButton}
        </div>
      )}
    </div>
  )
}
