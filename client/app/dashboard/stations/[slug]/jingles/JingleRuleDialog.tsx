"use client"

import { useState } from "react"
import Link from "next/link"
import { IconX } from "@tabler/icons-react"
import type { JingleList, JingleRule } from "@/interfaces/JingleList"
import type { Track } from "@/interfaces/Track"
import { Button } from "@/components/ds/Button"
import { DayToggle } from "@/components/ds/DayToggle"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { Notice } from "@/components/ds/Notice"
import { Segmented } from "@/components/ds/Segmented"
import { Select } from "@/components/ds/Select"
import { SwitchRow } from "@/components/ds/Switch"
import { HOURLY, ruleOf, ruleSentence, usesClock, WEEK_ORDER } from "./jingleRule"

/**
 * Minutes and song counts offered. A fixed list rather than a number field:
 * the useful range is "a few times an hour" to "a couple of times a shift",
 * and the API accepts anything from 1 to 720 minutes and 1 to 50 songs, so
 * this can grow without a backend change.
 */
const MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]
const SONGS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20]

function minutesLabel(m: number): string {
  if (m < 60) return `Every ${m} minutes`
  if (m === 60) return "Every hour"
  return m % 60 === 0 ? `Every ${m / 60} hours` : `Every ${m} minutes`
}

/**
 * The rule of one jingle list, edited as four questions — which jingle, how
 * often, when, and (for set times) whether exactly on time — with the
 * sentence it adds up to shown on top as you go. Saves with one PATCH.
 */
export function JingleRuleDialog({
  list,
  jingles,
  timezone,
  slug,
  onClose,
  onSave,
}: {
  list: JingleList | null
  /** This list's clips, for "always this one". */
  jingles: Track[]
  timezone: string | null
  slug: string
  onClose: () => void
  onSave: (rule: JingleRule) => Promise<void>
}) {
  const open = list !== null
  const [rule, setRule] = useState<JingleRule | null>(null)
  const [newTime, setNewTime] = useState("08:00")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<JingleList | null>(null)

  // Start from the list's saved rule each time the dialog opens on one.
  if (list !== openedFor) {
    setOpenedFor(list)
    if (list) {
      setRule(ruleOf(list))
      setSaving(false)
      setError(null)
    }
  }

  if (!rule) return null

  const set = (patch: Partial<JingleRule>) => setRule((r) => (r ? { ...r, ...patch } : r))
  const pinned = jingles.find((j) => j.id === rule.pinned_track_id)
  const needsZone = usesClock(rule) && !timezone
  const hasHours = rule.from_time !== null
  const limited = rule.days !== null || hasHours
  const incomplete =
    (rule.frequency === "times" && rule.times.length === 0) || (rule.pick === "single" && !rule.pinned_track_id) || (rule.days !== null && rule.days.length === 0)

  function addTime(time: string) {
    if (!time || rule!.times.includes(time)) return
    set({ times: [...rule!.times, time].sort() })
  }

  async function save() {
    if (!rule || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSave(rule)
      onClose()
    } catch (err: unknown) {
      const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
      setError(errors ? Object.values(errors)[0]?.[0] ?? "Couldn’t save the rule." : "Couldn’t save the rule.")
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>When {list?.name} plays</DialogTitle>
          <DialogDescription>{ruleSentence(rule, pinned?.title)}</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold text-muted-foreground">Which jingle</span>
          <Segmented
            aria-label="Which jingle"
            value={rule.pick}
            onChange={(pick) => set({ pick, pinned_track_id: pick === "single" ? (rule.pinned_track_id ?? jingles[0]?.id ?? null) : null })}
            options={[
              { value: "random", label: "Random" },
              { value: "in_order", label: "In order" },
              { value: "single", label: "Always one", disabled: jingles.length === 0 },
            ]}
          />
          {rule.pick === "single" && (
            <Select
              aria-label="The jingle to play"
              value={rule.pinned_track_id ?? undefined}
              onChange={(id) => set({ pinned_track_id: id })}
              options={jingles.map((j) => ({ value: j.id, label: j.title }))}
            />
          )}
          <p className="text-body-sm text-text-faint">
            {rule.pick === "random"
              ? "Each one plays once before any plays twice."
              : rule.pick === "in_order"
                ? "Top to bottom as listed, then from the top again."
                : "The same clip every time, like a top-of-the-hour ID."}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold text-muted-foreground">How often</span>
          <Segmented
            aria-label="How often"
            value={rule.frequency}
            onChange={(frequency) =>
              set({
                frequency,
                every_minutes: frequency === "minutes" ? (rule.every_minutes ?? 30) : rule.every_minutes,
                every_songs: frequency === "songs" ? (rule.every_songs ?? 4) : rule.every_songs,
              })
            }
            options={[
              { value: "songs", label: "Songs" },
              { value: "minutes", label: "Minutes" },
              { value: "times", label: "Set times" },
            ]}
          />
          {rule.frequency === "songs" && (
            <Select
              aria-label="Songs between jingles"
              value={String(rule.every_songs ?? 4)}
              onChange={(v) => set({ every_songs: Number(v) })}
              options={SONGS.map((n) => ({ value: String(n), label: n === 1 ? "After every song" : `Every ${n} songs` }))}
            />
          )}
          {rule.frequency === "minutes" && (
            <>
              <Select
                aria-label="Minutes between jingles"
                value={String(rule.every_minutes ?? 30)}
                onChange={(v) => set({ every_minutes: Number(v) })}
                options={MINUTES.map((m) => ({ value: String(m), label: minutesLabel(m) }))}
              />
              <p className="text-body-sm text-text-faint">At the first break once the time is up. A long song can push it back a little.</p>
            </>
          )}
          {rule.frequency === "times" && (
            <div className="flex flex-col gap-2.5 rounded-well bg-surface-raised p-3">
              {rule.times.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Set times">
                  {rule.times.map((t) => (
                    <li key={t} className="flex items-center gap-1 rounded-chip bg-surface-control py-1 pr-1 pl-2.5 font-mono text-body-sm tabular-nums">
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove ${t}`}
                        onClick={() => set({ times: rule.times.filter((x) => x !== t) })}
                        className="flex size-6 cursor-pointer items-center justify-center rounded-full text-text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <IconX className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  aria-label="Time to add"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="h-10 w-38 rounded-control bg-surface-inset px-3 font-mono text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button variant="subtle" onClick={() => addTime(newTime)} disabled={rule.times.includes(newTime)}>
                  Add time
                </Button>
                <Button variant="quiet" onClick={() => set({ times: HOURLY })}>
                  Every hour
                </Button>
                {rule.times.length > 0 && (
                  <Button variant="quiet" onClick={() => set({ times: [] })}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}
          {rule.frequency === "times" && (
            <SwitchRow
              title="Exactly on time"
              description={
                rule.exact
                  ? "The song playing at that time fades out, so the jingle starts on the dot."
                  : "Plays at the first break after that time, so the song is never cut."
              }
              checked={rule.exact}
              onCheckedChange={(exact) => set({ exact })}
            />
          )}
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold text-muted-foreground">When</span>
          <Segmented
            aria-label="When"
            value={limited ? "limited" : "always"}
            onChange={(v) =>
              set(v === "always" ? { days: null, from_time: null, to_time: null } : { days: [1, 2, 3, 4, 5], from_time: null, to_time: null })
            }
            options={[
              { value: "always", label: "Any time" },
              { value: "limited", label: "Some days or hours" },
            ]}
          />
          {limited && (
            <div className="flex flex-col gap-3 rounded-well bg-surface-raised p-3">
              <DayToggle
                aria-label="Days the list plays"
                stretch
                value={(rule.days ?? [0, 1, 2, 3, 4, 5, 6]).map((d) => WEEK_ORDER.indexOf(d as (typeof WEEK_ORDER)[number]))}
                onChange={(picked) => set({ days: picked.map((i) => WEEK_ORDER[i]) })}
              />
              <SwitchRow
                title="Only between certain hours"
                className="bg-card"
                checked={hasHours}
                onCheckedChange={(on) => set(on ? { from_time: "07:00", to_time: "10:00" } : { from_time: null, to_time: null })}
              />
              {hasHours && (
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-body-sm font-semibold text-muted-foreground">From</span>
                    <input
                      type="time"
                      value={rule.from_time ?? ""}
                      onChange={(e) => e.target.value && set({ from_time: e.target.value })}
                      className="h-11 rounded-control bg-surface-inset px-3 font-mono text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-body-sm font-semibold text-muted-foreground">
                      {rule.from_time && rule.to_time && rule.to_time <= rule.from_time ? "To (next day)" : "To"}
                    </span>
                    <input
                      type="time"
                      value={rule.to_time ?? ""}
                      onChange={(e) => e.target.value && set({ to_time: e.target.value })}
                      className="h-11 rounded-control bg-surface-inset px-3 font-mono text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </section>

        {needsZone && (
          <Notice
            tone="warn"
            title="Set your station’s timezone first"
            actions={
              <Button asChild variant="subtle" size="sm">
                <Link href={`/dashboard/stations/${slug}/settings`}>Open settings</Link>
              </Button>
            }
          >
            Times and days need to know which clock to follow.
          </Notice>
        )}
        {timezone && usesClock(rule) && <p className="text-body-sm text-text-faint">Times are in {timezone}.</p>}

        {error && (
          <p role="alert" className="text-body-sm text-fault-text">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button size="lg" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={save} disabled={saving || needsZone || incomplete}>
            {saving ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
