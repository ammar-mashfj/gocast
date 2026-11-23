import { cn } from "@/lib/utils"

/**
 * The mosque page's centrepiece: one Friday as a 24-hour ribbon under a sky
 * that runs night → dawn → day → dusk → night. Recitation (AutoDJ, Pro)
 * fills the day; the live moments sit on it. Times are illustrative and
 * named by prayer, not clock, because prayer times move daily — which is
 * also why GoCast can't schedule the adhan itself (said in the FAQ).
 * Static. Al-Noor is made up.
 */

type Live = { from: number; to: number; label: string; sub: string }

const LIVE: Live[] = [
  { from: 5.5, to: 6.5, label: "After Fajr", sub: "Morning reminder" },
  { from: 12.75, to: 13.75, label: "Jumu’ah", sub: "Khutbah, live" },
  { from: 19.75, to: 21, label: "After Isha", sub: "Weekly lesson" },
]

const HOURS = [0, 6, 12, 18, 24]

export function DayRibbon() {
  return (
    <figure className="flex flex-col gap-6 rounded-card bg-card p-5 sm:p-8">
      <div className="relative">
        {/* The sky: the day's light, left to right. */}
        <div
          aria-hidden
          className="h-24 rounded-item sm:h-32"
          style={{
            background:
              "linear-gradient(90deg, #0f1226 0%, #141938 18%, #6b4a6e 23%, #e6a15c 27%, #8fb6d9 34%, #a9cbe8 50%, #8fb6d9 66%, #e08a55 76%, #5b3d63 81%, #161a3a 86%, #0f1226 100%)",
          }}
        />
        {/* The recitation band: AutoDJ all day. */}
        <div className="absolute inset-x-0 bottom-0 h-7 rounded-b-item bg-on-air/85 sm:h-8" />
        <span className="absolute bottom-1.5 left-3 eyebrow-sm text-live-ink sm:bottom-2">Recitation · AutoDJ</span>
        {/* The live moments. */}
        {LIVE.map((l) => (
          <div
            key={l.label}
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${(l.from / 24) * 100}%`, width: `${((l.to - l.from) / 24) * 100}%` }}
          >
            <span className="h-full w-full rounded-[4px] bg-live shadow-[0_0_0_2px_var(--color-card)]" />
          </div>
        ))}
      </div>

      <div className="relative -mt-3 h-4 font-mono text-caption tabular-nums text-text-faint" aria-hidden>
        {HOURS.map((h) => (
          <span
            key={h}
            className={cn("absolute -translate-x-1/2", h === 0 && "translate-x-0", h === 24 && "-translate-x-full")}
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h % 24).padStart(2, "0")}:00
          </span>
        ))}
      </div>

      <figcaption className="grid gap-4 sm:grid-cols-3">
        {LIVE.map((l) => (
          <div key={l.label} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            <span className="mt-1.5 size-3 rounded-full bg-live" />
            <span className="font-display text-heading">{l.label}</span>
            <span className="col-start-2 text-body-sm text-muted-foreground">{l.sub} · Free</span>
          </div>
        ))}
      </figcaption>
    </figure>
  )
}
