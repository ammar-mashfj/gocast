"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  IconLoader2,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import type { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { cn } from "@/lib/utils"
import { useListenerSession } from "@/hooks/useListenerSession"
import { useStreamPlayback, type NowPlaying } from "@/hooks/useStreamPlayback"

interface EmbedPlayerProps {
  station: Station
}

/**
 * The player that renders inside a Pro owner's own website.
 *
 * One row, no chrome, no navigation — it fills whatever box the host iframe
 * gives it and does exactly one thing. Everything the full station page
 * layers on top (recent tracks, saved stations, notify-me, social links)
 * belongs on gocast.fm, which is where the wordmark in the corner leads.
 *
 * It deliberately shares the transport ladder and the listener session with
 * the station page rather than doing anything simpler: an embed listener is
 * a real listener and has to appear in the owner's audience numbers.
 */
export function EmbedPlayer({ station: initial }: EmbedPlayerProps) {
  const [station, setStation] = useState(initial)
  const [listeners, setListeners] = useState<number | null>(null)
  const [polled, setPolled] = useState<NowPlaying>({
    title: initial.now_playing?.title ?? null,
    artist: initial.now_playing?.artist ?? null,
  })

  const { audioRef, playing, loading, transport, inband, toggle } = useStreamPlayback({
    hlsUrl: station.hls_url,
    icecastUrl: `${env.icecastUrl}${station.icecast_mount}`,
  })

  useListenerSession(station.slug, playing, transport)

  // Same poll as the station page, at the same cadence. In-band ID3 wins
  // while it is available because it describes the audio this person is
  // actually hearing; the poll describes what the station is playing now,
  // several seconds ahead of an HLS listener's buffer.
  useEffect(() => {
    function poll() {
      fetch(`${env.apiUrl}/public/stations/${station.slug}/listeners`, {
        headers: { Accept: "application/json" },
      })
        .then((res) => res.json())
        .then((res) => {
          setListeners(typeof res.data?.count === "number" ? res.data.count : null)
          setStation((prev) => ({
            ...prev,
            is_live: res.data?.is_live ?? prev.is_live,
            is_on_air: res.data?.is_on_air ?? prev.is_on_air,
          }))
          const np = res.data?.now_playing
          setPolled({
            title: typeof np?.title === "string" && np.title.trim() !== "" ? np.title : null,
            artist: typeof np?.artist === "string" && np.artist.trim() !== "" ? np.artist : null,
          })
        })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 10000)
    return () => clearInterval(timer)
  }, [station.slug])

  const nowPlaying = inband ?? polled
  const offAir = !station.is_on_air
  const busy = loading && !playing

  const subtitle = offAir
    ? "Off air"
    : nowPlaying.title
      ? [nowPlaying.artist, nowPlaying.title].filter(Boolean).join(" — ")
      : station.is_live
        ? "Live now"
        : "On air"

  return (
    <div className="h-dvh w-full bg-background text-foreground flex items-center gap-3 px-3 select-none overflow-hidden">
      {/* The stream. preload="none" so a footer embed costs nothing until
          someone presses play. */}
      <audio ref={audioRef} preload="none" />

      {/* Artwork */}
      <div className="relative size-14 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        {station.artwork_url ? (
          <Image src={station.artwork_url} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <IconMusic className="size-6 text-muted-foreground" />
        )}
      </div>

      {/* Title + status */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{station.name}</span>
          {station.is_live && !offAir && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
              <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <span
          className={cn("text-xs truncate", offAir ? "text-muted-foreground/70" : "text-muted-foreground")}
          title={subtitle}
        >
          {subtitle}
        </span>
        {listeners !== null && listeners > 0 && !offAir && (
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            {listeners.toLocaleString()} listening
          </span>
        )}
      </div>

      {/* Play / pause */}
      <button
        type="button"
        onClick={toggle}
        disabled={offAir}
        aria-label={playing || busy ? "Stop" : "Play"}
        className={cn(
          "size-11 shrink-0 rounded-full flex items-center justify-center transition-colors",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        {busy ? (
          <IconLoader2 className="size-5 animate-spin" />
        ) : playing ? (
          <IconPlayerPauseFilled className="size-5" />
        ) : (
          <IconPlayerPlayFilled className="size-5 translate-x-px" />
        )}
      </button>

      {/* Attribution — the only link out. Opens the full station page on
          gocast.fm in a new tab so the host page is never navigated away. */}
      <a
        href={`${env.appUrl}/station/${station.slug}`}
        target="_blank"
        rel="noopener"
        className="hidden sm:flex shrink-0 flex-col items-end leading-none text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className="text-[9px] tracking-widest uppercase">on</span>
        <span className="text-xs font-semibold">GoCast</span>
      </a>
    </div>
  )
}
