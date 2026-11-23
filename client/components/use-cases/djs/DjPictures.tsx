import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * The DJ page's pictures, in the product's own formats with a made-up DJ
 * (Nadia K) and made-up numbers. Where the church page is a run-sheet, this
 * one is a deck: the two ways in and a crate of mixes. The hero's
 * now-playing deck moves, so it lives in DjDeckDemo.tsx.
 */

/** Way 1 (Free): the mixer's output is the studio's input. */
export function BrowserInputPicture() {
  return (
    <div className="flex min-h-44 flex-col justify-center gap-3 rounded-well bg-background p-4">
      <span className="eyebrow-sm text-text-faint">Input</span>
      <div className="flex h-11 items-center justify-between gap-2 rounded-item bg-surface-raised px-3">
        <span className="truncate text-body-sm font-semibold">Mixer · USB Audio (2 ch)</span>
        <IconChevronDown size={16} className="shrink-0 text-text-faint" />
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className={cn("h-2 flex-1 rounded-xs", i < 17 ? (i < 14 ? "bg-ok" : "bg-fault") : "bg-surface-strong")} />
        ))}
      </div>
      <span className="eyebrow-sm inline-flex items-center gap-2 text-ok">
        <IconCheck size={14} stroke={3} /> Stereo, no voice filters
      </span>
    </div>
  )
}

/** Way 2 (Pro): the encoder fields, as the Go live page lists them. */
export function EncoderFieldsPicture() {
  const rows = [
    ["Server", "ingest.gocast.fm"],
    ["Mount", "/nadia-k"],
    ["Password", "••••••••••"],
  ]
  return (
    <div className="flex min-h-44 flex-col justify-center gap-2 rounded-well bg-background p-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex h-9 items-center justify-between gap-3 rounded-item bg-surface-raised px-3">
          <span className="eyebrow-sm text-text-faint">{k}</span>
          <span className="truncate font-mono text-caption">{v}</span>
        </div>
      ))}
      <span className="eyebrow-sm mt-1 inline-flex items-center gap-2 text-ok">
        <span className="size-2 rounded-full bg-ok" /> Mixxx connected
      </span>
    </div>
  )
}

const MIXES = [
  { title: "Warehouse Sessions 014", length: "1:58:12", slot: "Fri 22:00" },
  { title: "Sunday Deep House", length: "1:02:40", slot: "Sun 18:00" },
  { title: "Back to '98 — Garage", length: "1:31:05", slot: "Wed 20:00" },
  { title: "Live at The Basement", length: "2:14:51", slot: "Rotation" },
]

/** The crate: past sets in the library, each with when AutoDJ plays it. */
export function MixCrate() {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-card p-3 sm:p-4">
      {MIXES.map((m, i) => (
        <div
          key={m.title}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-item px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_6rem]",
            i === 0 ? "bg-on-air-tint" : "bg-surface-raised",
          )}
        >
          <span className="min-w-0 truncate text-body font-semibold">{m.title}</span>
          <span className="font-mono text-body-sm tabular-nums text-muted-foreground sm:text-right">{m.length}</span>
          <span
            className={cn(
              "col-span-2 font-mono text-caption tabular-nums sm:col-span-1 sm:text-right",
              i === 0 ? "text-on-air-text" : "text-text-faint",
            )}
          >
            {i === 0 ? "▶ Playing" : m.slot}
          </span>
        </div>
      ))}
    </div>
  )
}
