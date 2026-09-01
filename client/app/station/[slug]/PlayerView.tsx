"use client"

import { useState, useEffect, useRef, useCallback, useId } from "react"
import Link from "next/link"
import {
  IconBrandX,
  IconLink,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
  IconLoader2,
  IconMusic,
  IconBroadcast,
  IconHeart,
  IconHeartFilled,
  IconChevronDown,
} from "@tabler/icons-react"
import Image from "next/image"
import Hls from "hls.js"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { shareOrCopy } from "@/lib/share"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useListenerSession } from "@/hooks/useListenerSession"
import { isSaved, toggleSaved, recordListen, subscribeLibrary } from "@/lib/listenerLibrary"
import { NotifyMeForm } from "./NotifyMeForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import styles from "./player.module.css"

const METADATA_PLACEHOLDERS = new Set(["", "unknown", "n/a", "-", "none", "null", "untitled"])

/** Max prior tracks kept in memory and shown under "Just played". */
const MAX_RECENT_TRACKS = 5

function cleanMetadata(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (METADATA_PLACEHOLDERS.has(trimmed.toLowerCase())) return null
  return trimmed
}

function Vinyl({ playing, artworkUrl }: { playing: boolean; artworkUrl?: string | null }) {
  return (
    <div className={`relative w-full max-w-[160px] sm:max-w-[220px] md:max-w-[320px] aspect-square ${styles.vinylFloat}`}>
      <div className={`size-full rounded-full bg-[conic-gradient(from_0deg,#1a1a2e,#16162a,#1a1a2e,#0f0f1f,#1a1a2e,#16162a,#1a1a2e)] flex items-center justify-center relative border border-white/5 ${playing ? styles.vinylSpin : ""}`}>
        <div className="absolute w-[87.5%] h-[87.5%] rounded-full border border-white/[0.04]" />
        <div className="absolute w-[75%] h-[75%] rounded-full border border-white/[0.03]" />
        <div className="w-[50%] h-[50%] rounded-full bg-gradient-to-br from-[#1a0533] via-[#2d1b69] to-[#1a0533] flex items-center justify-center border-2 border-white/10 relative overflow-hidden">
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt="Station artwork"
              fill
              sizes="(max-width: 640px) 80px, (max-width: 768px) 110px, 160px"
              priority
              className="object-cover"
            />
          ) : (
            <IconMusic className="size-9 md:size-12 text-violet-300/70" strokeWidth={1.5} />
          )}
        </div>
      </div>
    </div>
  )
}

function MiniEq() {
  return (
    <div className="flex items-end gap-[2px] h-4 w-3 shrink-0">
      <span className={`w-[3px] h-full rounded-sm bg-primary/80 ${styles.miniBarA}`} />
      <span className={`w-[3px] h-full rounded-sm bg-primary/80 ${styles.miniBarB}`} />
      <span className={`w-[3px] h-full rounded-sm bg-primary/80 ${styles.miniBarC}`} />
    </div>
  )
}

function ShareButtons({ station }: { station: Station }) {
  const url = `${env.appUrl}/station/${station.slug}`
  const [saved, setSaved] = useState(false)

  // Sync the heart with the live library state (also reflects cross-tab changes).
  useEffect(() => {
    // Initial hydration from localStorage — needs to happen post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(isSaved(station.slug))
    return subscribeLibrary(() => setSaved(isSaved(station.slug)))
  }, [station.slug])

  function handleToggleSave() {
    const nowSaved = toggleSaved({
      slug: station.slug,
      name: station.name,
      artworkUrl: station.artwork_url,
      genre: station.genre,
    })
    setSaved(nowSaved)
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
              aria-label={saved ? "Remove from saved" : "Save station"}
              onClick={handleToggleSave}
            >
              {saved
                ? <IconHeartFilled size={16} className="text-rose-400" />
                : <IconHeart size={16} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{saved ? "Saved" : "Save station"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Share on X"
              onClick={() => window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(`Listening to ${station.name} on GoCast`)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer")}
            >
              <IconBrandX size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on X</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Copy share link"
              onClick={() => { void shareOrCopy(url, station.name) }}
            >
              <IconLink size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy link</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

function VolumeControl({ audioRef }: { audioRef: React.RefObject<HTMLAudioElement | null> }) {
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const prevVolume = useRef(80)

  // The audio element is ours now rather than one a streaming library created
  // and handed back, so volume is just a property on it — and it survives the
  // stream being torn down and re-attached, which the old player's element did
  // not.
  function getAudio() {
    return audioRef.current
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
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
      >
        <VolumeIcon size={18} />
      </button>
      <Slider
        value={[volume]}
        max={100}
        step={1}
        onValueChange={handleVolumeChange}
        className="flex-1"
        aria-label="Volume"
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
  isOwner?: boolean
}

export function PlayerView({ station: initialStation, isOwner = false }: PlayerViewProps) {
  const [station, setStation] = useState(initialStation)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [listeners, setListeners] = useState(0)
  const [nowPlaying, setNowPlaying] = useState<{ title: string | null; artist: string | null }>({ title: null, artist: null })
  const [recentTracks, setRecentTracks] = useState<{ title: string; artist: string | null; at: number }[]>([])
  const [justPlayedOpen, setJustPlayedOpen] = useState(false)
  const justPlayedPanelId = useId()
  // Track the previous now-playing via ref so we can shift it into recents
  // without nesting setState calls inside an updater (React Compiler hates that).
  const prevNowPlayingRef = useRef<{ title: string | null; artist: string | null }>({ title: null, artist: null })

  // The audio element is ours, declared in the markup below. Both transports
  // attach to the same one, so volume, mute and the media-session controls do
  // not care which is in use.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)

  // Which transport actually carried the audio — not which one we intended.
  // A browser with no Media Source support and no native HLS falls back to the
  // Icecast mount, and the listener count depends on knowing that happened:
  // an Icecast listener is already inside the number the admin poll returns,
  // so reporting them as HLS would count them twice.
  const [transport, setTransport] = useState<"hls" | "icecast" | null>(null)

  // Whether in-band ID3 has ever arrived on this connection. Until it does the
  // poll below keeps driving "Now playing", so a stream whose metadata is
  // missing shows the right track instead of nothing at all.
  const hasInbandMetadataRef = useRef(false)

  // Poll listener count + live status + now-playing.
  //
  // In-band ID3 wins whenever it is available, and the reason is HLS-specific:
  // a listener is buffered several seconds behind the live edge, so this poll
  // describes the track the STATION is playing while ID3 describes the one
  // this person is actually hearing. Preferring the poll would caption their
  // audio with a track that has not reached them yet.
  //
  // The poll still matters. It populates the card before anyone presses play,
  // it covers silent gaps, and it is the fallback for a stream carrying no
  // ID3 at all — which is why it defers to `hasInbandMetadataRef` rather than
  // to "is something playing".
  useEffect(() => {
    function fetchListeners() {
      fetch(`${env.apiUrl}/public/stations/${station.slug}/listeners`, {
        headers: { Accept: "application/json" },
      })
        .then((res) => res.json())
        .then((res) => {
          setListeners(res.data?.count ?? 0)
          setStation((prev) => ({
            ...prev,
            is_live: res.data?.is_live ?? prev.is_live,
            is_on_air: res.data?.is_on_air ?? prev.is_on_air,
          }))

          if (!hasInbandMetadataRef.current) {
            const np = res.data?.now_playing
            const next = {
              title: typeof np?.title === "string" && np.title.trim() !== "" ? np.title : null,
              artist: typeof np?.artist === "string" && np.artist.trim() !== "" ? np.artist : null,
            }
            setNowPlaying((prev) =>
              prev.title === next.title && prev.artist === next.artist ? prev : next,
            )
          }
        })
        .catch(() => { /* listener poll failed — non-critical, retry on next interval */ })
    }
    fetchListeners()
    const timer = setInterval(fetchListeners, 10000)
    return () => clearInterval(timer)
  }, [station.slug])

  // Reports this browser as a listener for as long as audio is actually
  // playing — which is the whole difference between this and counting
  // requests: a paused tab is not an audience. Keyed off `playing` rather than
  // `loading` so a stream that never connects is never counted.
  //
  // The transport is passed through because it decides whether this listener
  // is ADDED to the station's live count or merely recorded: someone who fell
  // back to the Icecast mount is already inside the number the admin poll
  // returns, and counting them here as well would report them twice.
  useListenerSession(station.slug, playing, transport)

  /**
   * Fold a new title/artist into state, shifting the outgoing track into the
   * "Just played" list.
   *
   * Shared by both metadata sources so a track transition looks identical
   * whether it arrived as in-band ID3 or from the poll.
   */
  const applyMetadata = useCallback((next: { title: string | null; artist: string | null }) => {
    const prev = prevNowPlayingRef.current
    if (prev.title && (prev.title !== next.title || prev.artist !== next.artist)) {
      setRecentTracks((rec) => {
        if (rec[0]?.title === prev.title && rec[0]?.artist === prev.artist) return rec
        return [{ title: prev.title!, artist: prev.artist, at: Date.now() }, ...rec].slice(0, MAX_RECENT_TRACKS)
      })
    }
    prevNowPlayingRef.current = next
    setNowPlaying(next)
  }, [])

  /** Split the "Artist - Title" convention both ID3 and ICY use for one string. */
  const applyStreamTitle = useCallback((raw: string) => {
    const trimmed = raw.trim()
    const dash = trimmed.indexOf(" - ")
    applyMetadata(
      dash >= 0
        ? { artist: cleanMetadata(trimmed.slice(0, dash)), title: cleanMetadata(trimmed.slice(dash + 3)) }
        : { title: cleanMetadata(trimmed), artist: null },
    )
  }, [applyMetadata])

  const teardown = useCallback(() => {
    hlsRef.current?.destroy()
    hlsRef.current = null

    const audio = audioRef.current
    if (audio) {
      audio.pause()
      // Both must go. Clearing only `src` leaves a native HLS load in flight,
      // and removing only the attribute leaves the element holding the last
      // buffer — either way the next play starts from stale state.
      audio.removeAttribute("src")
      audio.load()
    }

    hasInbandMetadataRef.current = false
    setTransport(null)
    setPlaying(false)
    setLoading(false)
    setNowPlaying({ title: null, artist: null })
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (playing || loading) {
      teardown()
      return
    }

    setLoading(true)
    // Record this listen as soon as the user opts in to playing — anchors the
    // station in their personal history for the homepage "pick up where you left off" row.
    recordListen({
      slug: station.slug,
      name: station.name,
      artworkUrl: station.artwork_url,
      genre: station.genre,
    })

    const icecastUrl = `${env.icecastUrl}${station.icecast_mount}`

    /**
     * Last resort, and a real one: a browser with neither Media Source nor
     * native HLS still has to hear the station. The transport is reported
     * honestly so this listener is counted once, by the Icecast poll, rather
     * than twice.
     */
    function playIcecast() {
      hlsRef.current?.destroy()
      hlsRef.current = null
      setTransport("icecast")
      audio!.src = icecastUrl
      audio!.play().catch(() => setLoading(false))
    }

    const hlsUrl = station.hls_url

    if (!hlsUrl) {
      playIcecast()
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        // A live audio stream is never seeked backwards, so holding decoded
        // audio behind the playhead only costs memory on long listens.
        backBufferLength: 30,
      })
      hlsRef.current = hls

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setTransport("hls")
        audio.play().catch(() => setLoading(false))
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return

        // The standard recovery ladder. A live stream is a moving target, so
        // a network error usually means the manifest moved on while we were
        // reading it — retrying is far more likely to work than giving up.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
        } else {
          // Unrecoverable: fall back rather than leaving someone staring at a
          // spinner. The station is still on the Icecast mount.
          playIcecast()
        }
      })

      hls.loadSource(hlsUrl)
      hls.attachMedia(audio)
      return
    }

    // Safari plays HLS natively and has no Media Source for hls.js to use, so
    // this is the primary path there, not a fallback.
    if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      setTransport("hls")
      audio.src = hlsUrl
      audio.play().catch(() => playIcecast())
      return
    }

    playIcecast()
  }, [
    station.hls_url,
    station.icecast_mount,
    station.slug,
    station.name,
    station.artwork_url,
    station.genre,
    playing,
    loading,
    teardown,
  ])

  // In-band now-playing.
  //
  // Both transports surface ID3 the same way — as cues on a `metadata` text
  // track that hls.js and Safari's native player each populate — so one
  // listener covers both. The track does not exist until the first tag
  // arrives, which is why this watches `addtrack` rather than reading
  // textTracks once.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    function readCues(track: TextTrack) {
      const cues = track.activeCues
      if (!cues || cues.length === 0) return

      for (let i = 0; i < cues.length; i++) {
        // `value` is hls.js's and WebKit's parsed ID3 frame. TIT2 carries the
        // stream title, which Liquidsoap writes in the same "Artist - Title"
        // form as the ICY metadata this replaced.
        const value = (cues[i] as unknown as { value?: { key?: string; data?: unknown; info?: string } }).value
        if (!value || typeof value.data !== "string") continue

        if (value.key === "TIT2" || value.info === "StreamTitle") {
          hasInbandMetadataRef.current = true
          applyStreamTitle(value.data)
        } else if (value.key === "TPE1" && value.data.trim() !== "") {
          hasInbandMetadataRef.current = true
          setNowPlaying((prev) => ({ ...prev, artist: cleanMetadata(value.data as string) }))
        }
      }
    }

    const listening = new Set<TextTrack>()

    function watch(track: TextTrack) {
      if (track.kind !== "metadata" || listening.has(track)) return
      listening.add(track)
      // "hidden" rather than "showing": cues must fire without the browser
      // trying to render them over the (nonexistent) video surface.
      track.mode = "hidden"
      track.addEventListener("cuechange", () => readCues(track))
    }

    for (let i = 0; i < audio.textTracks.length; i++) watch(audio.textTracks[i])

    const onAddTrack = (event: TrackEvent) => {
      if (event.track) watch(event.track as TextTrack)
    }
    audio.textTracks.addEventListener("addtrack", onAddTrack)

    return () => {
      audio.textTracks.removeEventListener("addtrack", onAddTrack)
      listening.clear()
    }
  }, [applyStreamTitle])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [])

  // Tab title: while playing, show ▶ + track + station so users with multiple
  // tabs can find the right one at a glance.
  useDocumentTitle(
    playing
      ? `▶ ${nowPlaying.title ?? "Live"}${nowPlaying.artist ? ` · ${nowPlaying.artist}` : ""} · ${station.name} | GoCast`
      : null,
  )

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
      {/*
        The stream itself. Declared here rather than created by a library so
        both transports attach to one stable element — volume, mute and the
        media-session controls keep working across a fallback from HLS to
        Icecast, and `preload="none"` means nothing is fetched until someone
        actually presses play.

        Playback state is read off the element's own events instead of being
        set alongside `play()`: that way a stall, a recovered media error, or
        the OS pausing us for a phone call all move the UI, and the button can
        never claim to be playing while the audio is stopped.
      */}
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => {
          setPlaying(true)
          setLoading(false)
        }}
        onWaiting={() => setLoading(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setLoading(false)
        }}
        onError={() => {
          setPlaying(false)
          setLoading(false)
        }}
      />

      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute -bottom-[10%] -left-[10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-primary/15 to-transparent z-[1]" />
      <div className="hidden md:block absolute top-6 right-6 text-xs tracking-[3px] uppercase text-muted-foreground z-[3]" style={{ writingMode: "vertical-rl" }}>
        internet radio
      </div>

      {/* Owner-only chip — quick path back to the studio for station owners
          previewing their own player page. */}
      {isOwner && (
        <Link
          href={`/dashboard/stations/${station.slug}`}
          className="absolute top-4 left-4 z-[4] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-200 text-xs no-underline backdrop-blur-sm hover:bg-violet-500/25 hover:border-violet-500/50 transition-colors"
        >
          <IconBroadcast size={14} />
          You own this — Open studio
        </Link>
      )}

      {/* Mobile: vinyl + content centered together as one unit; desktop: two grid columns */}
      <div className="flex flex-1 flex-col items-center justify-center min-h-0 md:contents">

      {/* Vinyl — smaller on mobile */}
      <div className="relative w-full flex items-center justify-center pb-14 md:p-12 z-2 shrink-0 md:min-h-0">
        <Vinyl playing={playing} artworkUrl={station.artwork_url} />
      </div>

      {/* Content */}
      <div className="relative w-full flex flex-col items-center md:items-start md:justify-center px-6 md:pr-12 md:pl-4 pb-4 md:py-12 z-2 shrink-0">

        {station.genre && (
          <div className="text-xs mt-3 tracking-[3px] uppercase text-primary/80 font-medium mb-3 max-w-[340px] text-center md:text-left">
            {station.genre}
          </div>
        )}

        <h1 className="text-3xl md:text-5xl font-medium -tracking-wide leading-tight mb-3 text-center md:text-left">
          {station.name}
        </h1>

        {station.description && (
          <p className="text-base text-muted-foreground leading-relaxed mb-6 max-w-[340px] text-center md:text-left">
            {station.description}
          </p>
        )}

        {/* Now Playing — show whenever there's *something* to play. is_on_air
            covers both the live-broadcaster and AutoDJ-rotation cases; we
            also keep it visible while the user is mid-play/loading even if
            polling hasn't caught up yet. */}
        {(station.is_on_air || playing || loading || nowPlaying.title) && (
          <div className="flex items-center gap-3 mb-8 px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] w-full md:w-auto md:min-w-[260px] max-w-sm overflow-hidden">
            <div
              key={`${nowPlaying.title ?? ""}|${nowPlaying.artist ?? ""}`}
              className={`flex items-center gap-3 min-w-0 w-full`}
            >
               <MiniEq />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="text-xs tracking-[2px] uppercase text-muted-foreground">Now playing</div>
                {nowPlaying.title ? (
                  <>
                    <div className={`text-sm font-medium truncate ${styles.trackSlideIn}`} title={nowPlaying.artist ? `${nowPlaying.title} — ${nowPlaying.artist}` : nowPlaying.title}>
                      {nowPlaying.title}
                    </div>
                    {nowPlaying.artist && (
                      <div className="text-xs text-muted-foreground truncate">{nowPlaying.artist}</div>
                    )}
                  </>
                ) : (
                  <div className={`text-sm font-medium truncate ${styles.trackSlideIn}`}>
                    {playing ? "Live audio" : "Press play to tune in"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recently played — button disclosure so open *and* close can animate (unlike native <details>). */}
        {recentTracks.length > 0 && (
          <div
            className={`${styles.recentsRoot} mb-6 w-full max-w-sm md:w-auto md:min-w-[260px]`}
            data-open={justPlayedOpen ? "true" : "false"}
          >
            <button
              type="button"
              id={`${justPlayedPanelId}-trigger`}
              className="inline-flex w-full max-w-full cursor-pointer select-none items-center gap-1.5 border-0 bg-transparent p-0 text-left font-[inherit] text-xs tracking-[2px] uppercase text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={justPlayedOpen}
              aria-controls={justPlayedPanelId}
              onClick={() => setJustPlayedOpen((o) => !o)}
            >
              Just played
              <span className={styles.recentsChevron} aria-hidden>
                <IconChevronDown size={16} stroke={1.75} />
              </span>
              <span className="text-text-faint normal-case tracking-normal">· {recentTracks.length}</span>
            </button>
            <div className={styles.recentsPanel} id={justPlayedPanelId} role="region" aria-labelledby={`${justPlayedPanelId}-trigger`}>
              <div className={styles.recentsPanelInner} inert={!justPlayedOpen}>
                <ol className="mt-2 flex flex-col gap-1.5 pl-0 list-none">
                  {recentTracks.slice(0, MAX_RECENT_TRACKS).map((t, i) => (
                    <li key={`${t.at}-${i}`} className="text-xs text-muted-foreground truncate" title={t.artist ? `${t.title} — ${t.artist}` : t.title}>
                      <span className="text-text-faint mr-1.5">{i + 1}.</span>
                      <span className="text-foreground/85">{t.title}</span>
                      {t.artist && <span className="text-muted-foreground"> — {t.artist}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Controls row — Play button is available whenever audio is on air
            (broadcaster or AutoDJ). Off-air state only shows when the
            station is genuinely silent. */}
        <div className="flex items-center gap-4 mb-6">
          {station.is_on_air || playing || loading || nowPlaying.title ? (
            <>
              <Button
                size="icon"
                className={`size-14 md:size-16 rounded-full shadow-lg shadow-primary/20 ${!playing && !loading ? styles.playPulse : ""}`}
                onClick={togglePlay}
                aria-label={playing ? "Pause" : loading ? "Connecting" : "Play"}
                disabled={false}
              >
                {loading ? (
                  <IconLoader2 size={26} className="animate-spin" />
                ) : playing ? (
                  <IconPlayerPauseFilled size={26}  />
                ) : (
                  <IconPlayerPlayFilled size={26} />
                )}
              </Button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  playing
                    ? "max-w-32 opacity-100 translate-x-0"
                    : "max-w-0 opacity-0 -translate-x-1.5 pointer-events-none"
                }`}
                aria-hidden={!playing}
              >
                <VolumeControl audioRef={audioRef} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Badge variant="secondary" className="text-sm px-4 py-2 self-start">
                <span className="size-1.5 bg-muted-foreground/60 rounded-full mr-2" />
                Off air
              </Badge>
              
              <NotifyMeForm slug={station.slug} stationName={station.name} />
            </div>
          )}
        </div>

        {/* Listeners + Share — show count whenever there's audience to count. */}
        <div className="flex flex-wrap items-center gap-4">
          {(station.is_on_air || playing || nowPlaying.title) && (
            <div className="flex items-center gap-2 text-base text-muted-foreground">
              <div className="size-1.5 bg-emerald-400 rounded-full" />
              {listeners.toLocaleString()} listening
            </div>
          )}
          <ShareButtons station={station} />
        </div>

        {/* <RelatedStations excludeSlug={station.slug} /> */}
      </div>

      </div>

      <WaveDecoration />

      {/* Footer */}
      <div className="mt-auto md:mt-0 md:absolute bottom-0 left-0 right-0 px-6 md:px-12 py-3.5 md:py-3 flex flex-col md:flex-row justify-center items-center gap-2 z-[3] border-t border-white/5 shrink-0 bg-background/40 backdrop-blur-sm">
        <div className="text-sm text-muted-foreground">
          Powered by{" "}
          <Link href="/" className="text-primary no-underline hover:underline font-medium">GoCast</Link>
          {" — "}
          <Link href="/auth/register" className="text-primary no-underline hover:underline font-medium">Start your own station</Link>
        </div>
      </div>
    </div>
  )
}
