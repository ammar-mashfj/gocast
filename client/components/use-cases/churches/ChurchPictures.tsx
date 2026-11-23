import { StatusLamp } from "@/components/ds/StatusLamp"
import { ProTag, Tag } from "@/components/ds/Tag"
import { cn } from "@/lib/utils"

/**
 * The church page's pictures. Like the homepage mocks they are drawn in the
 * product's own formats (the player page, the station's on-air states) with
 * a made-up church — Grace Chapel — and made-up numbers. Static on purpose:
 * this page is read, not watched. The hero's card is the one exception
 * and lives in ChurchPlayerDemo.tsx.
 */

type Slot = {
  time: string
  title: string
  note: string
  kind: "live" | "autodj"
  now?: boolean
}

const SUNDAY: Slot[] = [
  { time: "07:00", title: "Morning worship", note: "Your playlist, from the library", kind: "autodj" },
  { time: "10:30", title: "Sunday service", note: "Live from the sound desk", kind: "live", now: true },
  { time: "12:15", title: "Worship music", note: "Picks up by itself when the service ends", kind: "autodj" },
  { time: "18:00", title: "Evening prayer", note: "Live from the pastor's laptop", kind: "live" },
  { time: "19:00", title: "Hymns through the night", note: "Until the next live service", kind: "autodj" },
]

/**
 * The centrepiece: a Sunday at Grace Chapel as a run-sheet, each row the
 * state the station is in. It doubles as the honest Free/Pro line — red rows
 * are the browser studio (Free), violet rows are AutoDJ (Pro).
 */
export function SundayRunSheet() {
  return (
    <div className="flex flex-col gap-4 rounded-card bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="font-display text-title-sm">Sunday at Grace Chapel</span>
        <div className="flex flex-wrap items-center gap-2">
          <Tag variant="neutral" className="gap-2">
            <span className="size-2 rounded-full bg-live" /> Live · Free
          </Tag>
          <Tag variant="onair" className="gap-2">
            <span className="size-2 rounded-full bg-on-air" /> AutoDJ · <ProTag />
          </Tag>
        </div>
      </div>
      <ol role="list" className="flex flex-col gap-2">
        {SUNDAY.map((s) => (
          <li
            key={s.time}
            className={cn(
              "grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-3 rounded-item p-3.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-5",
              s.kind === "live" ? "bg-live-tint" : "bg-surface-raised",
              s.now && "shadow-[0_0_0_1.5px_var(--color-live)]",
            )}
          >
            <span className="font-mono text-body-sm tabular-nums text-muted-foreground">{s.time}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body font-semibold">{s.title}</span>
              <span className="text-body-sm text-muted-foreground">{s.note}</span>
            </span>
            <span className="col-start-2 sm:col-start-auto">
              {s.kind === "live" ? (
                <StatusLamp tone="live" size="sm" pulse={s.now}>
                  {s.now ? "On air now" : "Live"}
                </StatusLamp>
              ) : (
                <StatusLamp tone="onair" size="sm">
                  AutoDJ
                </StatusLamp>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="px-1 text-body-sm text-text-faint text-pretty">
        On Free the station is on air for the live rows only, and quiet in between. Pro fills the gaps with your own
        music.
      </p>
    </div>
  )
}

/** Sound desk → laptop → listeners, the whole setup in one line. */
export function SetupChain() {
  const links = [
    { k: "Sound desk", v: "the mix you already make" },
    { k: "Laptop", v: "GoCast open in the browser" },
    { k: "Listeners", v: "one link, any phone" },
  ]
  return (
    <ol role="list" className="grid gap-3 sm:grid-cols-3">
      {links.map((l, i) => (
        <li key={l.k} className="relative flex flex-col gap-1 rounded-card bg-card p-5">
          <span className="eyebrow-sm text-text-faint">0{i + 1}</span>
          <span className="font-display text-card-title">{l.k}</span>
          <span className="text-body-sm text-muted-foreground">{l.v}</span>
        </li>
      ))}
    </ol>
  )
}
