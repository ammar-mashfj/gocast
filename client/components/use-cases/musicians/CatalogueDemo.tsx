"use client"

import { IconArrowsShuffle, IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { airClock, demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The musicians hero: an artist's own station, playing their catalogue,
 * acted out. The sleeve is the station's artwork (GoCast keeps one image
 * per station, not one per track, so the sleeve never changes with the
 * song). Tracks move on, the count drifts, the shuffle line counts the deck
 * — AutoDJ's shuffle plays every track once before any repeats. No play
 * button: a labelled preview. Hollow Pines and the songs are made up.
 */

const TRACKS = [
  { title: "Paper Boats", from: "Low Tide" },
  { title: "Glasshouse", from: "Low Tide" },
  { title: "Northbound (demo)", from: "Demos & B-sides" },
  { title: "Small Hours", from: "Singles" },
  { title: "Low Tide", from: "Low Tide" },
]

const TRACK_S = 7
const DECK = 42

export function CatalogueDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const i = Math.floor(secs / TRACK_S)
  const track = TRACKS[i % TRACKS.length]
  const played = 17 + (i % (DECK - 17))
  const progress = ((secs % TRACK_S) + 1) / TRACK_S

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · your station, between releases</span>
      <div ref={ref} className="flex flex-col gap-5 rounded-card bg-card p-4 sm:p-5">
        {/* The sleeve: station artwork, drawn rather than shipped as an image. */}
        <div
          aria-hidden
          className="relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-item p-5"
          style={{
            background:
              "radial-gradient(120% 90% at 20% 15%, #f4b860 0%, transparent 55%), radial-gradient(90% 80% at 85% 90%, #6d5bd0 0%, transparent 60%), linear-gradient(160deg, #2b2340, #13111c)",
          }}
        >
          <span className="font-mono text-caption tracking-widest text-white/70 uppercase">Hollow Pines Radio</span>
          <span className="font-display text-[clamp(2.5rem,8vw,4rem)] leading-[0.9] font-extrabold tracking-[-0.04em] text-white">
            Hollow
            <br />
            Pines
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <StatusLamp tone="onair" size="sm" pulse>
              On air
            </StatusLamp>
            <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
              <IconHeadphones size={16} />
              <span className="text-foreground">{demoListeners(34, secs)}</span>
            </span>
          </div>
          <span key={track.title} className="animate-in fade-in duration-500 truncate font-display text-title-sm">
            {track.title}
          </span>
          <span className="truncate text-body-sm text-muted-foreground">
            Hollow Pines · from <span className="text-foreground">{track.from}</span>
          </span>
        </div>

        <div key={i} className="h-1 overflow-hidden rounded-full bg-surface-strong">
          <div className="h-full rounded-full bg-on-air transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="flex items-center justify-between gap-3 font-mono text-caption tabular-nums text-text-faint">
          <span className="inline-flex items-center gap-1.5">
            <IconArrowsShuffle size={14} /> {played} of {DECK} played, no repeats yet
          </span>
          <span>{airClock(3 * 3600 + 14 * 60, secs)}</span>
        </div>
      </div>
    </div>
  )
}
