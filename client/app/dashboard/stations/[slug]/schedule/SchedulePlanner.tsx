"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { toast } from "sonner"
import { IconPlus } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { useMounted } from "@/hooks/useMounted"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/interfaces/Playlist"
import type { Programme, Station } from "@/interfaces/Station"
import { DayList } from "./DayList"
import { ScheduleStatus } from "./ScheduleStatus"
import { SlotPanel } from "./SlotPanel"
import { DAY_SHORT, SWATCHES, WeekGrid } from "./WeekGrid"
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
  const proRequest = useProRequest()
  const mounted = useMounted()
  const timezone = station.timezone
  const settingsHref = `/dashboard/stations/${station.slug}/settings#show-times`

  const [blocks, setBlocks] = useState<Block[]>(() => explode(station.autodj_slots ?? []))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [newKeys, setNewKeys] = useState<Set<string>>(() => new Set())
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
  const libraryHref = `/dashboard/stations/${station.slug}/library`
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
      const { data } = await api.put<{ data: Station }>(`/stations/${station.slug}/autodj-slots`, {
        // No `timezone`: it is set in Station settings, and the API keeps
        // the station's when this is omitted.
        slots: merge(sending),
      })
      setSaved(snapshot(sending))
      setProgramme(data.data.programme ?? null)
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

  const statusLine: Record<SaveState, { text: string; tone: string }> = {
    saved: { text: "Saved", tone: "text-live-text" },
    pending: { text: "Unsaved changes", tone: "text-muted-foreground" },
    saving: { text: "Saving…", tone: "text-muted-foreground" },
    overlap: { text: "Not saved: slots overlap", tone: "text-fault-text" },
    error: { text: "Not saved", tone: "text-fault-text" },
    "no-timezone": { text: "Not saved: no timezone", tone: "text-fault-text" },
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground max-w-[62ch]">
            What plays when you&apos;re not live. Going live always takes over.
          </p>
        </div>
        <div className="flex w-full items-center justify-between gap-x-3 gap-y-1 sm:w-auto sm:justify-start">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em]">
            {!locked && (
              <span role="status" className={cn("font-semibold", statusLine[saveState].tone)}>
                {statusLine[saveState].text}
              </span>
            )}
            <span className="text-muted-foreground">{timezone ?? "No timezone set"}</span>
            <Link
              href={settingsHref}
              className="normal-case tracking-normal font-sans text-sm font-medium text-violet hover:underline underline-offset-2"
            >
              {timezone ? "Change" : "Set timezone"}
            </Link>
          </div>
          {!locked && (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={save}
              disabled={!dirty || saving || blockedBy !== null}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </header>

      {saveState === "error" && (
        <p role="alert" className="rounded-lg border border-fault/40 bg-fault/10 px-4 py-3 text-sm text-fault-text">
          {saveError}
        </p>
      )}
      {saveState === "no-timezone" && (
        <p role="alert" className="text-sm text-fault-text">
          Your station needs a timezone before slots can be saved.{" "}
          <Link href={settingsHref} className="underline underline-offset-2">Set it in Station settings</Link>.
        </p>
      )}

      <ScheduleStatus
        slug={station.slug}
        locked={locked}
        programme={programme}
        timezone={timezone}
        defaultName={defaultPlaylist?.name ?? null}
        shows={station.schedules ?? []}
        clock={mounted ? (now?.label ?? null) : null}
      />

      <Dialog open={selected !== null && !locked} onOpenChange={(open) => !open && setSelectedKey(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
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

      <div>
        <section
          aria-labelledby="schedule-week"
          className="flex min-w-0 flex-col gap-4 rounded-xl border border-white/[0.07] bg-panel p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="schedule-week" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
              This week
              {locked ? (
                <Badge variant="pro">Pro</Badge>
              ) : (
                <HelpLink article="schedule-playlists-by-time" label="scheduling playlists by day and time" />
              )}
            </h2>
            {!locked && (
              <div className="hidden items-center gap-3 md:flex">
                <span className="text-xs text-muted-foreground">
                  Drag along a day to add a slot. Drag a slot&apos;s edge to change that day.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addFromButton}
                  disabled={noPlaylists}
                  title={noPlaylists ? "Make a playlist in your Library first." : undefined}
                >
                  <IconPlus data-icon="inline-start" />
                  Add slot
                </Button>
              </div>
            )}
          </div>

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
              readOnly={locked || noPlaylists}
              onSelect={setSelectedKey}
              onCreate={create}
              onChange={changeOne}
            />
          </div>

          {/* The grid's legend; the day list spells each row out instead. */}
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm border border-white/[0.12] bg-white/[0.025]" />
              {locked ? "Off air unless you're live" : `${defaultPlaylist?.name ?? "Default playlist"} (everything else)`}
            </span>
            {(station.schedules ?? []).length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3.5 rounded-sm border border-dashed border-live/70" />
                Your show times ·{" "}
                <Link href={settingsHref} className="underline underline-offset-2 hover:text-foreground">edit</Link>
              </span>
            )}
            {now && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-0.5 rounded-full bg-foreground" />
                Now
              </span>
            )}
          </div>

          {!locked && noPlaylists && (
            <p className="text-sm text-muted-foreground max-w-[62ch]">
              A slot plays a playlist, and this station has none yet.{" "}
              <Link href={libraryHref} className="underline underline-offset-2 hover:text-foreground">
                Make one in your Library
              </Link>
              , then come back to plan the week.
            </p>
          )}

          <p className="text-sm text-muted-foreground max-w-[62ch]">
            {locked
              ? "With Pro, AutoDJ plays your music whenever you're not live, and you can pick a different playlist for certain hours."
              : "When you're not live, AutoDJ plays your music. A slot starts after the song playing at its start time, or exactly on time if you set it to. Going live always takes over."}
          </p>

          {locked && (
            <div>
              {/* "Request", not "Upgrade" — Pro is granted by hand. */}
              <Button variant="outline" onClick={proRequest.open} disabled={proRequest.requested}>
                {proRequest.requested ? "Request sent" : "Request Pro"}
              </Button>
            </div>
          )}
        </section>
      </div>

      {!locked && (dirty || saveError) && (
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-white/[0.09] bg-panel/95 px-4 py-3 shadow-lg backdrop-blur md:hidden">
          <span className={cn("font-mono text-[11px] font-semibold uppercase tracking-[0.1em]", statusLine[saveState].tone)}>
            {statusLine[saveState].text}
          </span>
          <Button type="button" size="sm" onClick={save} disabled={!dirty || saving || blockedBy !== null}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  )
}
