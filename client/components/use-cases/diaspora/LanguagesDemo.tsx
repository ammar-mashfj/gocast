"use client"

import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The diaspora hero: five made-up community stations, in five languages and
 * two directions of script, taking turns on one player card. The names and
 * the "community news" lines are real words in each language; the stations
 * are not real. `dir="auto"` lets the Arabic run right to left; the marketing
 * surface falls back to IBM Plex Sans Arabic for its glyphs (dashboard.css).
 * No play button: a labelled preview.
 */

const STATIONS = [
  { name: "Sauti ya Nyumbani", now: "Habari za Jumuiya", lang: "Kiswahili", from: "London", base: 74 },
  { name: "صوت البلد", now: "أخبار الجالية", lang: "العربية", from: "Berlin", base: 132 },
  { name: "Rádio Saudade", now: "Notícias da Comunidade", lang: "Português", from: "Toronto", base: 58 },
  { name: "Raadiyaha Hooyo", now: "Wararka Bulshada", lang: "Soomaali", from: "Minneapolis", base: 91 },
  { name: "Tahanan FM", now: "Balita ng Komunidad", lang: "Tagalog", from: "Dubai", base: 66 },
]

const STEP_S = 6

export function LanguagesDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const s = STATIONS[Math.floor(secs / STEP_S) % STATIONS.length]

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · five stations, five languages</span>
      <div ref={ref} className="flex flex-col gap-4 rounded-card bg-card p-5">
        <div key={s.name} className="flex animate-in fade-in flex-col gap-4 duration-500">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-tag bg-surface-raised px-2 py-1 text-caption font-semibold" dir="auto">
              {s.lang}
            </span>
            <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
              <IconHeadphones size={16} />
              <span className="text-foreground">{demoListeners(s.base, secs)}</span>
            </span>
          </div>
          <span dir="auto" className="truncate font-display text-title-lg">
            {s.name}
          </span>
          <div className="flex flex-col gap-1 rounded-well bg-background p-4">
            <StatusLamp tone="live" size="sm" pulse>
              Live
            </StatusLamp>
            <span dir="auto" className="truncate text-body font-semibold">
              {s.now}
            </span>
            <span className="text-body-sm text-muted-foreground">Broadcasting from {s.from}</span>
          </div>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {STATIONS.map((x) => (
            <span key={x.name} className={x.name === s.name ? "h-1 flex-1 rounded-full bg-foreground" : "h-1 flex-1 rounded-full bg-surface-strong"} />
          ))}
        </div>
      </div>
    </div>
  )
}
