import { IconArrowDown, IconArrowRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/**
 * The FM page's centrepiece: the signal chain, from the studio desk to
 * every place a listener can be. The FM path is the station's own; the
 * online path is GoCast's. Static — it's a diagram, read left to right
 * (top to bottom on a phone).
 */

type Node = { k: string; v: string; ours?: boolean }

const STUDIO: Node[] = [
  { k: "Your studio", v: "Desk, playout, processing" },
  { k: "Your encoder", v: "BUTT, RadioDJ, SAM, ffmpeg…" },
  { k: "GoCast", v: "Takes the feed, 128 kbps stereo out", ours: true },
]

const OUT = [
  { k: "Your player page", v: "One link, any browser" },
  { k: "Your website", v: "The embedded player" },
  { k: "Radio apps", v: "TuneIn, Sonos, VLC via your stream URL" },
]

function Box({ n, className }: { n: Node; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-card p-4.5",
        n.ours ? "bg-on-air-tint shadow-[0_0_0_1.5px_var(--color-on-air)]" : "bg-card",
        className,
      )}
    >
      <span className="font-display text-heading">{n.k}</span>
      <span className="text-body-sm text-muted-foreground">{n.v}</span>
    </div>
  )
}

function Join() {
  return (
    <span aria-hidden className="flex items-center justify-center text-text-faint">
      <IconArrowDown size={20} className="lg:hidden" />
      <IconArrowRight size={20} className="hidden lg:block" />
    </span>
  )
}

export function SignalChain() {
  return (
    <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_minmax(0,1.1fr)]">
      {STUDIO.map((n) => (
        <div key={n.k} className="contents">
          <Box n={n} />
          <Join />
        </div>
      ))}
      <ul role="list" className="flex flex-col gap-2">
        {OUT.map((o) => (
          <li key={o.k} className="flex flex-col gap-0.5 rounded-item bg-card px-4 py-3">
            <span className="text-body font-semibold">{o.k}</span>
            <span className="text-body-sm text-muted-foreground">{o.v}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
