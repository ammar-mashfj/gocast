"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  IconBrandX,
  IconLink,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { StreamPlayer } from "@/lib/streamPlayer"
import { env } from "@/lib/env"
import { shareOrCopy } from "@/lib/share"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import styles from "./player.module.css"

const EQ_CLASSES = [
  styles.bar1, styles.bar2, styles.bar3, styles.bar4,
  styles.bar5, styles.bar6, styles.bar7, styles.bar8,
  styles.bar9, styles.bar10, styles.bar11, styles.bar12,
] as const

function Vinyl({ playing, artworkUrl }: { playing: boolean; artworkUrl?: string | null }) {
  return (
    <div className={`relative w-full max-w-[160px] md:max-w-[320px] aspect-square ${styles.vinylFloat}`}>
      <div className={`size-full rounded-full bg-[conic-gradient(from_0deg,#1a1a2e,#16162a,#1a1a2e,#0f0f1f,#1a1a2e,#16162a,#1a1a2e)] flex items-center justify-center relative border border-white/5 ${playing ? styles.vinylSpin : ""}`}>
        <div className="absolute w-[87.5%] h-[87.5%] rounded-full border border-white/[0.04]" />
        <div className="absolute w-[75%] h-[75%] rounded-full border border-white/[0.03]" />
        <div className="w-[50%] h-[50%] rounded-full bg-gradient-to-br from-[#1a0533] via-[#2d1b69] to-[#1a0533] flex items-center justify-center border-2 border-white/10 relative overflow-hidden">
          {artworkUrl ? (
            <img src={artworkUrl} alt="Station artwork" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="text-[28px] md:text-[42px] opacity-70">♫</span>
          )}
        </div>
      </div>
    </div>
  )
}

function EqBars({ playing }: { playing: boolean }) {
  if (!playing) return null
  return (
    <div className="flex items-end gap-[3px] h-11 mb-6">
      {EQ_CLASSES.map((cls, i) => (
        <div key={i} className={`w-1 rounded-sm bg-primary/80 ${cls}`} />
      ))}
    </div>
  )
}

function ShareButtons({ slug }: { slug: string }) {
  const url = `${env.appUrl}/station/${slug}`
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    await shareOrCopy(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={() => window.open(`https://x.com/intent/tweet?text=Listening+to+${encodeURIComponent(url)}`, "_blank")}
            >
              <IconBrandX size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on X</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={handleShare}>
              {copied ? <IconCheck size={14} className="text-emerald-400" /> : <IconLink size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied!" : "Copy link"}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

function VolumeControl({ playerRef }: { playerRef: React.RefObject<StreamPlayer | null> }) {
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const prevVolume = useRef(80)

  function getAudio() {
    return playerRef.current?.getAudioElement() ?? null
  }

  function handleVolumeChange(value: number[]) {
    const v = value[0]
    setVolume(v)
    setMuted(v === 0)
    const audio = getAudio()
    if (audio) audio.volume = v / 100
  }

  function toggleMute() {
    const audio = getAudio()
    if (muted) {
      const restore = prevVolume.current || 80
      setVolume(restore)
      setMuted(false)
      if (audio) audio.volume = restore / 100
    } else {
      prevVolume.current = volume
      setVolume(0)
      setMuted(true)
      if (audio) audio.volume = 0
    }
  }

  const VolumeIcon = muted || volume === 0 ? IconVolumeOff : volume < 50 ? IconVolume2 : IconVolume

  return (
    <div className="flex items-center gap-2 w-28">
      <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer">
        <VolumeIcon size={18} />
      </button>
      <Slider
        value={[volume]}
        max={100}
        step={1}
        onValueChange={handleVolumeChange}
        className="flex-1"
      />
    </div>
  )
}

function WaveDecoration() {
  const d = "M0 20 Q25 5 50 20 T100 20 T150 20 T200 20 T250 20 T300 20 T350 20 T400 20 T450 20 T500 20 T550 20 T600 20 T650 20 T700 20 T750 20 T800 20 T850 20 T900 20 T950 20 T1000 20 T1050 20 T1100 20 T1150 20 T1200 20"
  return (
    <div className="absolute bottom-[60px] left-0 right-0 h-10 overflow-hidden z-[1] opacity-[0.06]">
      <div className={`flex ${styles.wave}`}>
        <svg width="1200" height="40" viewBox="0 0 1200 40"><path d={d} fill="none" stroke="white" strokeWidth="1.5" /></svg>
        <svg width="1200" height="40" viewBox="0 0 1200 40"><path d={d} fill="none" stroke="white" strokeWidth="1.5" /></svg>
      </div>
    </div>
  )
}

interface PlayerViewProps {
  station: Station
}

export function PlayerView({ station: initialStation }: PlayerViewProps) {
  const [station, setStation] = useState(initialStation)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [listeners, setListeners] = useState(0)
  const [nowPlaying, setNowPlaying] = useState<{ title: string | null; artist: string | null }>({ title: null, artist: null })
  const playerRef = useRef<StreamPlayer | null>(null)

  // Poll listener count + live status
  useEffect(() => {
    function fetchListeners() {
      fetch(`${env.apiUrl}/public/stations/${station.slug}/listeners`, {
        headers: { Accept: "application/json" },
      })
        .then((res) => res.json())
        .then((res) => {
          setListeners(res.data?.count ?? 0)
          setNowPlaying(res.data?.now_playing ?? { title: null, artist: null })
          setStation((prev) => ({ ...prev, is_live: res.data?.is_live ?? prev.is_live }))
        })
        .catch(() => { /* listener poll failed — non-critical, retry on next interval */ })
    }
    fetchListeners()
    const timer = setInterval(fetchListeners, 10000)
    return () => clearInterval(timer)
  }, [station.slug])

  const togglePlay = useCallback(() => {
    if ((playing || loading) && playerRef.current) {
      playerRef.current.stop()
      playerRef.current = null
      setPlaying(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const player = new StreamPlayer({
      onStateChange: (isPlaying) => {
        setPlaying(isPlaying)
        setLoading(false)
      },
      onError: () => {
        setPlaying(false)
        setLoading(false)
      },
    })
    playerRef.current = player
    player.play(`${env.icecastUrl}${station.icecast_mount}`)
  }, [station.icecast_mount, playing, loading])

  // Cleanup on unmount
  useEffect(() => {
    return () => playerRef.current?.stop()
  }, [])

  // OS Media Session — drives the lock screen card, notification, and Bluetooth/headset remotes.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return

    if (!playing) {
      navigator.mediaSession.playbackState = "none"
      navigator.mediaSession.metadata = null
      return
    }

    const artworkUrl = station.artwork_url || `${env.appUrl}/media-icon-512.png`
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title || station.name,
      artist: nowPlaying.artist || station.name,
      album: `Live on GoCast${station.genre ? ` · ${station.genre}` : ""}`,
      artwork: [{ src: artworkUrl, sizes: "512x512", type: "image/png" }],
    })

    navigator.mediaSession.playbackState = "playing"
    navigator.mediaSession.setActionHandler("play", togglePlay)
    navigator.mediaSession.setActionHandler("pause", togglePlay)
    navigator.mediaSession.setActionHandler("stop", togglePlay)
    // Live radio — disable seeking, there's no timeline to scrub.
    navigator.mediaSession.setActionHandler("seekbackward", null)
    navigator.mediaSession.setActionHandler("seekforward", null)
    navigator.mediaSession.setActionHandler("seekto", null)
    navigator.mediaSession.setActionHandler("previoustrack", null)
    navigator.mediaSession.setActionHandler("nexttrack", null)
  }, [playing, station, nowPlaying, togglePlay])

  return (
    <div className="relative h-screen bg-background text-foreground flex flex-col md:grid md:grid-cols-2 overflow-hidden">
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute -bottom-[10%] -left-[10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-primary/15 to-transparent z-[1]" />
      <div className="hidden md:block absolute top-6 right-6 text-[11px] tracking-[4px] uppercase text-muted-foreground z-[3]" style={{ writingMode: "vertical-rl" }}>
        internet radio
      </div>

      {/* Vinyl — smaller on mobile */}
      <div className="relative flex items-center justify-center p-6 pt-10 md:p-12 z-2 shrink min-h-0">
        <Vinyl playing={playing} artworkUrl={station.artwork_url} />
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center md:items-start justify-center px-6 md:pr-12 md:pl-4 py-4 md:py-12 z-2 shrink-0">
        <EqBars playing={playing} />

        {station.is_live && (
          <Badge variant="destructive" className={styles.liveBadge}>
            <span className="size-2 bg-current rounded-full" />
            LIVE
          </Badge>
        )}

        {station.genre && (
          <div className="text-xs mt-3 tracking-[3px] uppercase text-primary/80 font-medium mb-3">
            {station.genre}
          </div>
        )}

        <h1 className="text-3xl md:text-5xl font-medium -tracking-wide leading-[1.1] mb-3 text-center md:text-left">
          {station.name}
        </h1>

        {station.description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed mb-6 max-w-[340px] text-center md:text-left">
            {station.description}
          </p>
        )}

        {/* Now Playing */}
        {station.is_live && (nowPlaying.title || nowPlaying.artist) && (
          <div className="flex items-center gap-3 mb-8 px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] w-full md:w-auto max-w-sm">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="text-[11px] tracking-[1.5px] uppercase text-muted-foreground">Now playing</div>
              <div className="text-sm font-medium truncate">{nowPlaying.title || station.name}</div>
              {nowPlaying.artist && (
                <div className="text-xs text-muted-foreground truncate">{nowPlaying.artist}</div>
              )}
            </div>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center gap-4 mb-6">
          {station.is_live || playing || loading ? (
            <>
              <Button
                size="icon"
                className="size-14 md:size-16 rounded-full shadow-lg shadow-primary/20"
                onClick={togglePlay}
                disabled={false}
              >
                {loading ? (
                  <IconLoader2 size={26} className="animate-spin" />
                ) : playing ? (
                  <IconPlayerPauseFilled size={26} />
                ) : (
                  <IconPlayerPlayFilled size={26} />
                )}
              </Button>
              {playing && <VolumeControl playerRef={playerRef} />}
            </>
          ) : (
            <Badge variant="secondary" className="text-sm px-4 py-2">Station is offline</Badge>
          )}
        </div>

        {/* Listeners + Share */}
        <div className="flex items-center gap-4">
          {station.is_live && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <div className="size-1.5 bg-emerald-400 rounded-full" />
              {listeners.toLocaleString()} listening
            </div>
          )}
          <ShareButtons slug={station.slug} />
        </div>
      </div>

      <WaveDecoration />

      {/* Footer */}
      <div className="relative md:absolute bottom-0 left-0 right-0 px-6 md:px-12 py-3 flex flex-col md:flex-row justify-between items-center gap-2 z-[3] border-t border-white/5 shrink-0">
        <div className="text-xs text-muted-foreground">
          Powered by{" "}
          <Link href="/" className="text-primary no-underline hover:underline">GoCast</Link>
          {" — "}
          <Link href="/auth/register" className="text-primary no-underline hover:underline">Start your own station</Link>
        </div>
        <div className="text-xs text-muted-foreground hidden md:block">
          {env.appUrl}/station/{station.slug}
        </div>
      </div>
    </div>
  )
}
