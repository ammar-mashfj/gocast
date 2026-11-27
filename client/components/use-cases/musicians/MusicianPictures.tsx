import { IconArrowsShuffle, IconListNumbers, IconMicrophone } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"

/**
 * The musicians page's still pictures, each in a product format: the browser
 * studio's queue (Free), the Playlists page (Pro), the audience page's
 * countries (Pro). Hollow Pines and the numbers are made up.
 */

const QUEUE = [
  { title: "Paper Boats", len: "3:41", state: "playing" },
  { title: "Glasshouse", len: "4:02", state: "next" },
  { title: "Low Tide", len: "5:18", state: "" },
  { title: "Small Hours", len: "3:27", state: "" },
]

/** Premiere night: the studio queue with the mic between tracks. */
export function PremiereQueuePicture() {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <StatusLamp tone="live" size="sm" pulse>
          Live · album premiere
        </StatusLamp>
        <span className="font-mono text-caption tabular-nums text-text-faint">Fri 20:00</span>
      </div>
      <ol role="list" className="flex flex-col gap-1.5">
        {QUEUE.map((t, i) => (
          <li
            key={t.title}
            className={cn(
              "flex h-11 items-center gap-3 rounded-item px-3",
              t.state === "playing" ? "bg-live-tint" : "bg-surface-raised",
            )}
          >
            <span className="w-4 font-mono text-caption tabular-nums text-text-faint">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">{t.title}</span>
            {t.state && (
              <span className={cn("eyebrow-sm", t.state === "playing" ? "text-live-text" : "text-text-faint")}>
                {t.state === "playing" ? "Playing" : "Next"}
              </span>
            )}
            <span className="font-mono text-caption tabular-nums text-muted-foreground">{t.len}</span>
          </li>
        ))}
      </ol>
      <div className="flex h-12 items-center justify-center gap-2 rounded-item bg-foreground text-body-sm font-bold text-background">
        <IconMicrophone size={18} /> Hold to talk
      </div>
    </div>
  )
}

const PLAYLISTS = [
  { name: "Low Tide (album)", count: 11, mode: "In order", swatch: "bg-on-air" },
  { name: "Singles", count: 6, mode: "Shuffle", swatch: "bg-live" },
  { name: "Demos & B-sides", count: 14, mode: "Shuffle", swatch: "bg-ok" },
  { name: "Live at The Crypt", count: 11, mode: "In order", swatch: "bg-fault" },
]

/** The catalogue as playlists, the way the Playlists page lists them. */
export function CataloguePlaylistsPicture() {
  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-card p-3 sm:p-4">
      {PLAYLISTS.map((p) => (
        <div key={p.name} className="flex h-13 items-center gap-3 rounded-item bg-surface-raised px-3.5">
          <span className={cn("size-3 shrink-0 rounded-full", p.swatch)} />
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{p.name}</span>
          <span className="hidden font-mono text-caption tabular-nums text-text-faint sm:inline">{p.count} tracks</span>
          <span className="inline-flex w-22 items-center justify-end gap-1.5 text-caption font-semibold text-muted-foreground">
            {p.mode === "Shuffle" ? <IconArrowsShuffle size={14} /> : <IconListNumbers size={14} />}
            {p.mode}
          </span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center justify-between gap-3 px-1.5">
        <span className="eyebrow-sm text-text-faint">Sundays 20:00</span>
        <span className="text-body-sm text-muted-foreground">The album, start to finish</span>
      </div>
    </div>
  )
}

const COUNTRIES = [
  ["United Kingdom", 31],
  ["United States", 24],
  ["Germany", 12],
  ["Brazil", 9],
  ["Japan", 6],
] as const

/** Where listeners are, as the audience page totals it. */
export function CountriesPicture() {
  const max = COUNTRIES[0][1]
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <span className="font-display text-heading">Listeners by country</span>
        <span className="eyebrow-sm text-text-faint">Last 90 days</span>
      </div>
      <ul role="list" className="flex flex-col gap-2.5">
        {COUNTRIES.map(([c, pct]) => (
          <li key={c} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
            <span className="truncate text-body-sm">{c}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-raised">
              <span className="block h-full rounded-full bg-pro" style={{ width: `${(pct / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono text-caption tabular-nums text-muted-foreground">{pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
