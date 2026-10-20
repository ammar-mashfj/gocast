"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Image from "next/image"
import {
  IconLoader2,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react"
import type { Station } from "@/interfaces/Station"
import type { EmbedOptions } from "@/lib/embed"
import { env } from "@/lib/env"
import { taggedStationUrl } from "@/lib/share"
import { cn } from "@/lib/utils"
import { useListenerSession } from "@/hooks/useListenerSession"
import { usePublicStationFeed } from "@/hooks/usePublicStationStats"
import { useStreamPlayback, type NowPlaying } from "@/hooks/useStreamPlayback"
import { Slider } from "@/components/ui/slider"

interface EmbedPlayerProps {
  station: Station
  /** Extra controls from the snippet's address; none is the plain player. */
  options?: EmbedOptions
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
export function EmbedPlayer({ station: initial, options = {} }: EmbedPlayerProps) {
  const [station, setStation] = useState(initial)
  const [listeners, setListeners] = useState<number | null>(null)
  const [polled, setPolled] = useState<NowPlaying>({
    title: initial.now_playing?.title ?? null,
    artist: initial.now_playing?.artist ?? null,
  })

  const { audioRef, playing, loading, transport, inband, toggle, stop } = useStreamPlayback({
    hlsUrl: station.hls_url,
    icecastUrl: `${env.icecastUrl}${station.icecast_mount}`,
  })

  useListenerSession(station.slug, playing, transport)

  // The same shared feed the station page uses, so an embed and the full page
  // open side by side are one request rather than two. In-band ID3 wins while
  // it is available because it describes the audio this person is actually
  // hearing; the poll describes what the station is playing now, several
  // seconds ahead of an HLS listener's buffer.
  //
  // Paused while hidden, like the station page. An embed sits on somebody
  // else's site, where a reader scrolling past leaves it mounted and unseen
  // for as long as the tab is open.
  usePublicStationFeed(station.slug, (stats) => {
    setListeners(stats.count)
    setStation((prev) => ({
      ...prev,
      is_on_air: stats.is_on_air ?? prev.is_on_air,
    }))
    setPolled(stats.now_playing)
  })

  const nowPlaying = inband ?? polled
  const offAir = !station.is_on_air
  const busy = loading && !playing

  // Turned off under a listener: the stream just stops arriving and the
  // spinner would run forever. Same rule as the station page — stop once the
  // feed says off air and the buffered tail has run out.
  useEffect(() => {
    if (offAir && loading) stop()
  }, [offAir, loading, stop])

  const subtitle = offAir
    ? "Off air"
    : nowPlaying.title
      ? [nowPlaying.artist, nowPlaying.title].filter(Boolean).join(" — ")
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

      {(options.volume || options.mute) && (
        <VolumeControls audioRef={audioRef} slider={!!options.volume} muteButton={!!options.mute} />
      )}

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
        href={taggedStationUrl(env.appUrl, station.slug, "embed")}
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

/**
 * iPhone and iPad: the page can't set the volume there (only the device's
 * own buttons can), so a slider would move and change nothing. False on the
 * server and on the first paint, so the markup hydrates the same either way.
 */
function useIgnoresVolume(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    () => false,
  )
}
const noSubscribe = () => () => {}

/**
 * The volume slider and the mute button, whichever the owner ticked. Mute is
 * the element's own `muted`, not volume 0: it is the one that works on iOS,
 * and unmuting gives back the level the listener had. Moving the slider
 * unmutes, as every player does. The slider gives way first when the host's
 * box is narrow (below 360px), so the station name keeps its room.
 */
function VolumeControls({
  audioRef,
  slider,
  muteButton,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>
  slider: boolean
  muteButton: boolean
}) {
  const [volume, setVolume] = useState(100)
  const [muted, setMuted] = useState(false)
  const ignoresVolume = useIgnoresVolume()
  const showSlider = slider && !ignoresVolume

  function changeVolume([v]: number[]) {
    setVolume(v)
    const audio = audioRef.current
    if (!audio) return
    audio.volume = v / 100
    if (muted && v > 0) {
      audio.muted = false
      setMuted(false)
    }
  }

  function toggleMute() {
    const audio = audioRef.current
    const next = !muted
    if (audio) audio.muted = next
    setMuted(next)
  }

  const silent = muted || volume === 0
  const Icon = silent ? IconVolumeOff : volume < 50 ? IconVolume2 : IconVolume

  return (
    <div className="flex shrink-0 items-center gap-2">
      {muteButton && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon className="size-5" />
        </button>
      )}
      {showSlider && (
        <Slider
          value={[muted ? 0 : volume]}
          max={100}
          step={1}
          onValueChange={changeVolume}
          aria-label="Volume"
          className="w-20 max-[359px]:hidden"
        />
      )}
    </div>
  )
}
