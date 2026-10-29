"use client"

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  IconArrowUpRight,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react"
import Hls from "hls.js"
import { toast } from "sonner"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { createNetworkRecovery } from "@/lib/hlsRecovery"
import { createPlaylistLoader } from "@/lib/hlsPlaylistLoader"
import { shareOrCopy, taggedStationUrl } from "@/lib/share"
import { resolveSocialLink } from "@/lib/socialLinks"
import { cn } from "@/lib/utils"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useListenerSession } from "@/hooks/useListenerSession"
import { usePublicStationFeed } from "@/hooks/usePublicStationStats"
import { isSaved, toggleSaved, recordListen, subscribeLibrary } from "@/lib/listenerLibrary"
import { NotifyMeForm } from "./NotifyMeForm"
import { Button } from "@/components/ds/Button"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { Slider } from "@/components/ui/slider"
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

/**
 * The genre field is one free-text string, and owners write lists into it
 * ("Rock, Pop, Talk"). Split on the separators people use so each reads as
 * its own chip; a single genre is a list of one.
 */
function splitGenres(genre: string | null): string[] {
  if (!genre) return []
  const seen = new Set<string>()
  return genre
    .split(/\s*[,/|·•]\s*/)
    .map((g) => g.trim())
    .filter((g) => {
      const key = g.toLowerCase()
      if (!g || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Two letters for the artwork placeholder, skipping the words every station shares. */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^(radio|station|fm|the)$/i.test(w))
  const picked = (words.length > 0 ? words : name.split(/\s+/)).slice(0, 2)
  return picked.map((w) => Array.from(w)[0] ?? "").join("").toUpperCase()
}

/**
 * What the station is doing, as one word, for the public.
 *
 * Two states, not three. Whether a person is at the mic or AutoDJ is playing
 * is the owner's business, not the listener's: a station that runs AutoDJ
 * between shows should not have its page announce which hour is which. So
 * the page only says whether there is audio, in the one on-air colour.
 */
type AirState = "onair" | "off"

const AIR_LABEL: Record<AirState, string> = { onair: "On air", off: "Off air" }

/**
 * The waveform's bars: fixed heights and timings, computed once at module
 * scope so the server and the browser draw the same thing. It is decoration —
 * the stream carries no levels to the page — so it only moves while audio is
 * actually playing, and rests flat otherwise.
 */
const BARS = Array.from({ length: 64 }, (_, i) => ({
  h: Math.min(100, 30 + Math.round(Math.abs(Math.sin(i * 1.7) * 50 + Math.sin(i * 0.45) * 20))),
  d: (0.45 + ((i * 37) % 50) / 100).toFixed(2),
  dl: (-((i * 53) % 90) / 100).toFixed(2),
}))

function Waveform({ playing, className }: { playing: boolean; className: string }) {
  return (
    <div className={`${styles.wave} flex items-center gap-[3px]`} aria-hidden>
      {BARS.map((b, i) => (
        <span
          key={i}
          className={cn(styles.bar, playing && styles.barOn, "flex-1 rounded-[2px]", className)}
          style={{ height: `${b.h}%`, "--d": `${b.d}s`, "--dl": `${b.dl}s` } as CSSProperties}
        />
      ))}
    </div>
  )
}

function PlayButton({
  playing,
  loading,
  onClick,
  className,
}: {
  playing: boolean
  loading: boolean
  onClick: () => void
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? "Pause" : loading ? "Connecting" : "Play"}
      className={cn(
        styles.btn,
        "relative flex flex-none cursor-pointer items-center justify-center rounded-full border-0 transition-transform duration-100 active:scale-96",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {loading ? (
        <IconLoader2 size={26} className="animate-spin" />
      ) : playing ? (
        <IconPlayerPauseFilled size={26} />
      ) : (
        <IconPlayerPlayFilled size={26} className="ml-1" />
      )}
    </button>
  )
}

function VolumeControl({ audioRef }: { audioRef: React.RefObject<HTMLAudioElement | null> }) {
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const prevVolume = useRef(80)

  function handleVolumeChange(value: number[]) {
    const v = value[0]
    setVolume(v)
    setMuted(v === 0)
    const audio = audioRef.current
    if (!audio) return
    audio.volume = v / 100
    // Moving the slider up takes the mute off, as in every player.
    audio.muted = v === 0
  }

  // Mute is the element's own `muted`, not volume 0: iPhone and iPad ignore
  // a page setting the volume, so volume 0 muted nothing there. The slider
  // still shows 0 while muted and gives back the level on unmute.
  function toggleMute() {
    const audio = audioRef.current
    if (muted) {
      const restore = prevVolume.current || 80
      setVolume(restore)
      setMuted(false)
      if (audio) {
        audio.volume = restore / 100
        audio.muted = false
      }
    } else {
      prevVolume.current = volume
      setVolume(0)
      setMuted(true)
      if (audio) audio.muted = true
    }
  }

  const VolumeIcon = muted || volume === 0 ? IconVolumeOff : volume < 50 ? IconVolume2 : IconVolume

  return (
    <div className="flex w-32 items-center gap-2">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        className="shrink-0 cursor-pointer opacity-70 transition-opacity hover:opacity-100"
      >
        <VolumeIcon size={18} />
      </button>
      <Slider value={[volume]} max={100} step={1} onValueChange={handleVolumeChange} className="flex-1" aria-label="Volume" />
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
  const [aboutOpen, setAboutOpen] = useState(false)
  const [following, setFollowing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Follow is the listener library (localStorage), so it is read after mount
  // — the server has no localStorage — and kept in step across tabs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollowing(isSaved(station.slug))
    return subscribeLibrary(() => setFollowing(isSaved(station.slug)))
  }, [station.slug])

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
  }, [])

  function toggleFollow() {
    setFollowing(
      toggleSaved({
        slug: station.slug,
        name: station.name,
        artworkUrl: station.artwork_url,
        genre: station.genre,
      }),
    )
  }

  // One share button, not one per network: `navigator.share` opens the
  // viewer's own share sheet; where it is missing this copies instead, and
  // the button says so.
  async function share() {
    const url = taggedStationUrl(env.appUrl, station.slug, "listener")
    const result = await shareOrCopy(url, station.name, `Listening to ${station.name} on GoCast`)
    if (result !== "copied") return
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 1600)
  }

  // Track the previous now-playing via ref so we can shift it into recents
  // without nesting setState calls inside an updater (React Compiler hates that).
  const prevNowPlayingRef = useRef<{ title: string | null; artist: string | null }>({ title: null, artist: null })

  // The audio element is ours, declared in the markup below. Both transports
  // attach to the same one, so volume, mute and the media-session controls do
  // not care which is in use.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** When the last few Icecast reconnects after a media error happened; see onError. */
  const icecastRecoveriesRef = useRef<number[]>([])
  const allowIcecastRecovery = useCallback(() => {
    const now = Date.now()
    const recent = icecastRecoveriesRef.current.filter((at) => now - at < 60_000)
    if (recent.length >= 3) return false
    icecastRecoveriesRef.current = [...recent, now]
    return true
  }, [])
  /**
   * Is the station's current run on the relay path (Icecast only, no HLS)?
   * Seeded from the rendered payload — a relay run renders with no
   * `hls_url` — and kept current by the public feed below.
   */
  const icecastOnlyRef = useRef(station.is_on_air && station.hls_url === null)
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

  /**
   * Fold a new title/artist into state, shifting the outgoing track into the
   * "Just played" list.
   *
   * THE single writer for `nowPlaying`. Both metadata sources go through it, so
   * a track transition looks identical whether it arrived as in-band ID3 or
   * from the poll, and `prevNowPlayingRef` cannot drift out of step with the
   * state it is supposed to describe — it did, while the artist was patched in
   * by a second, separate update, and every "Just played" entry lost its artist
   * as a result.
   *
   * Unchanged metadata is dropped here rather than at each call site. It is the
   * common case, not an edge one: Liquidsoap writes the same ID3 tag into every
   * HLS segment, so the same track is re-announced every few seconds for as
   * long as it plays.
   */
  const applyMetadata = useCallback((next: { title: string | null; artist: string | null }) => {
    const prev = prevNowPlayingRef.current
    if (prev.title === next.title && prev.artist === next.artist) return

    if (prev.title) {
      setRecentTracks((rec) => {
        if (rec[0]?.title === prev.title && rec[0]?.artist === prev.artist) return rec
        return [{ title: prev.title!, artist: prev.artist, at: Date.now() }, ...rec].slice(0, MAX_RECENT_TRACKS)
      })
    }
    prevNowPlayingRef.current = next
    setNowPlaying(next)
  }, [])

  /**
   * Split the "Artist - Title" convention, for the sources that really use it.
   *
   * That is Icecast's `StreamTitle` and its ICY-over-HLS equivalent (a TXXX
   * frame described as "StreamTitle") — one string with both halves in it,
   * because ICY has only one field to put them in.
   *
   * It is NOT how Liquidsoap tags HLS segments. Those carry a proper ID3 frame
   * set with the title in TIT2 and the artist in TPE1, and running them through
   * here would both invent an artist for any track whose name contains " - "
   * and discard the real one. See `readCues`.
   */
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
    // The ref has to go with the state it mirrors. `applyMetadata` drops an
    // update that matches it, so leaving the last track behind here would make
    // pressing play again on that same track a no-op: the card would sit empty
    // until the station moved on.
    prevNowPlayingRef.current = { title: null, artist: null }
    setNowPlaying({ title: null, artist: null })
  }, [])

  // Listener count + live status + now-playing, from the SHARED feed: one
  // timer and one request per station however many components ask, and paused
  // while the tab is hidden.
  //
  // That pause is the one that counts. This is the only poll in the app whose
  // volume scales with AUDIENCE rather than with owners — a popular station
  // left open in fifty background tabs used to be fifty timers asking
  // forever, for a page nobody was looking at.
  //
  // In-band ID3 wins whenever it is available, and the reason is HLS-specific:
  // a listener is buffered several seconds behind the live edge, so this feed
  // describes the track the STATION is playing while ID3 describes the one
  // this person is actually hearing. Preferring the feed would caption their
  // audio with a track that has not reached them yet.
  //
  // The feed still matters. It populates the card before anyone presses play,
  // it covers silent gaps, and it is the fallback for a stream carrying no ID3
  // at all — which is why it defers to `hasInbandMetadataRef` rather than to
  // "is something playing".
  usePublicStationFeed(station.slug, (stats) => {
    if (stats.icecast_only !== null) icecastOnlyRef.current = stats.icecast_only
    setListeners(stats.count ?? 0)
    setStation((prev) => ({
      ...prev,
      is_live: stats.is_live ?? prev.is_live,
      is_on_air: stats.is_on_air ?? prev.is_on_air,
    }))

    // Off air while we are waiting for audio: see `onWaiting` below.
    if (stats.is_on_air === false && loading) teardown()

    // Switched off while someone is listening. Icecast does not end the
    // stream: it moves the listener to the shared silence mount and keeps
    // them there indefinitely, so without this the button would sit on
    // "playing" over silence until the tab closed. `offline` and not
    // `is_on_air`, which is also false while a container restarts — a blip
    // the listener should ride out, not be stopped by.
    if (stats.state === "offline" && playing) teardown()

    if (!hasInbandMetadataRef.current) applyMetadata(stats.now_playing)
  })

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

    // A station on the relay path has no HLS stream for this run. The feed
    // says so live, because this page may predate the run.
    const hlsUrl = icecastOnlyRef.current ? null : station.hls_url

    if (!hlsUrl) {
      playIcecast()
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        // A live audio stream is never seeked backwards, so holding decoded
        // audio behind the playhead only costs memory on long listens.
        backBufferLength: 30,
        // Start two segments behind the live edge instead of hls.js's three.
        // At 4s segments that is ~4s closer to the broadcaster, for 8s rather
        // than 12s of headroom against a late segment on a slow connection.
        liveSyncDurationCount: 2,
        // Stops iOS Safari from reloading the playlist in a loop after the
        // phone wakes. See createPlaylistLoader.
        pLoader: createPlaylistLoader(Hls),
      })
      hlsRef.current = hls
      const retryNetwork = createNetworkRecovery(hls, Hls, playIcecast)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setTransport("hls")
        audio.play().catch(() => setLoading(false))
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return

        // The standard recovery ladder. A live stream is a moving target, so
        // a network error usually means the manifest moved on while we were
        // reading it, so retrying usually works. Retries are spaced out and
        // capped, then we fall back to Icecast. See createNetworkRecovery.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          retryNetwork()
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

    /**
     * Read one tag — every frame of it — and apply it as a SINGLE update.
     *
     * The frames of a tag all share a timestamp, so they go active together and
     * arrive here as one `cuechange` with the whole set in `activeCues`. Title
     * and artist live in different frames, so anything that applies them one at
     * a time is applying half a tag twice:
     *
     *   TYER "2025"  TIT2 "КАМИН"  TDAT "2025"  TPE1 "EMIN feat. JONY"  TALB …
     *
     * Per-frame, TIT2 set the title with no artist and TPE1 patched the artist
     * back in afterwards. Since Liquidsoap repeats the tag in every segment,
     * that cleared-then-restored artist ran every few seconds for the whole
     * listen, and the dock line remounts whenever the artist changes, so it
     * replayed its entrance animation each time — the flicker. It was also
     * silently order-dependent: the frame order is whatever the file's own tags
     * give (three different layouts across the stations on this box), and a file
     * listing TPE1 before TIT2 would have had its artist wiped by the title
     * frame that followed and never shown one at all.
     */
    function readCues(track: TextTrack) {
      const cues = track.activeCues
      if (!cues || cues.length === 0) return

      let title: string | null = null
      let artist: string | null = null
      let streamTitle: string | null = null

      for (let i = 0; i < cues.length; i++) {
        // `value` is hls.js's and WebKit's parsed ID3 frame: `key` is the frame
        // id, and `info` is the description of a TXXX frame (empty otherwise).
        const value = (cues[i] as unknown as { value?: { key?: string; data?: unknown; info?: string } }).value
        if (!value || typeof value.data !== "string") continue

        if (value.info === "StreamTitle") {
          // ICY metadata smuggled through a TXXX frame: both halves in one
          // string, to be split. A real TIT2 is not this.
          streamTitle = value.data
        } else if (value.key === "TIT2") {
          title = cleanMetadata(value.data)
        } else if (value.key === "TPE1") {
          artist = cleanMetadata(value.data)
        }
      }

      if (streamTitle !== null) {
        hasInbandMetadataRef.current = true
        applyStreamTitle(streamTitle)
        return
      }

      // No title in this tag, no caption to show — and crucially, no reason to
      // claim in-band metadata and shut the poll out. A tag we cannot read
      // leaves the feed driving the card, which is the whole point of that
      // fallback.
      if (title === null) return

      hasInbandMetadataRef.current = true
      applyMetadata({ title, artist })
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
  }, [applyMetadata, applyStreamTitle])

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
      ? nowPlaying.title
        ? `▶ ${nowPlaying.title}${nowPlaying.artist ? ` · ${nowPlaying.artist}` : ""} · ${station.name} | GoCast`
        : `▶ ${station.name} | GoCast`
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

  /** There is audio to hear — a broadcaster, AutoDJ, or a stream already open. */
  const audible = station.is_on_air || playing || loading || nowPlaying.title !== null

  const airState: AirState = station.is_on_air ? "onair" : "off"

  /**
   * Play, or say why not. The button used to be disabled off air, and a
   * disabled control taps like a broken one: Clarity logged the taps as rage
   * clicks on every station that spends its day off. Now it answers, and
   * hands over to the one thing worth doing while there is nothing to hear.
   */
  const pressPlay = useCallback(() => {
    if (audible) {
      togglePlay()
      return
    }
    toast.info(`${station.name} is off air right now`, {
      description: "Leave your email and we'll let you know when it next goes live.",
    })
    const input = document.getElementById(`notify-${station.slug}`)
    if (input instanceof HTMLElement) {
      input.scrollIntoView({ behavior: "smooth", block: "center" })
      input.focus({ preventScroll: true })
    }
  }, [audible, togglePlay, station.name, station.slug])

  const genres = splitGenres(station.genre)
  const links = (station.social_links ?? []).map(resolveSocialLink).filter((link) => link !== null)
  const listeningLine = `${listeners.toLocaleString()} listening`
  // The sheet holds everything the page has no room for, so it is offered
  // whenever there is any of that to show.
  const hasAbout = !!station.description || links.length > 0 || genres.length > 2 || recentTracks.length > 0

  return (
    // `data-surface="marketing"` puts the page on the design system's warm
    // palette (app/dashboard.css), like the homepage and auth pages.
    <div
      data-surface="marketing"
      className={`${styles.page} flex min-h-dvh flex-col bg-background font-display text-foreground`}
    >
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
        onWaiting={() => {
          // A station turned off under a listener never says so on the
          // stream: the manifest stops moving (or 404s), hls.js retries it
          // forever, and once the buffer runs dry this fires with nothing
          // left to clear it — a spinner that never ends. The feed knows,
          // so stop instead. Checked here and on each feed tick, whichever
          // learns second, so the buffered tail still plays out first.
          if (!station.is_on_air) teardown()
          else setLoading(true)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setLoading(false)
        }}
        onError={() => {
          // Icecast splices a listener onto /standby and back at whatever
          // byte its buffer ends on, usually mid-frame, whenever a source
          // drops: a relay broadcaster's blip or reconnect, a container
          // recreate. Now and then that half frame reaches Chrome's decoder,
          // which treats it as fatal (MEDIA_ERR_DECODE) — about 1 drop in 12
          // in testing. A fresh connection starts clean, so reconnect, a few
          // times a minute at most, while the station is still on air.
          //
          // A second after the error rather than at once: it lands on the
          // moment a source has just dropped. A new URL each time: Chrome
          // took up to a minute to play a reload of the same one. And give it
          // time — Chrome buffers up to ~8 s of a fresh Icecast stream before
          // it plays, so no watchdog here; a further error retries.
          const audio = audioRef.current
          if (audio && transport === "icecast" && station.is_on_air && allowIcecastRecovery()) {
            setLoading(true)
            const url = `${env.icecastUrl}${station.icecast_mount}`
            window.setTimeout(() => {
              // Pressed stop, or the station went off, in the meantime.
              if (audioRef.current !== audio || !audio.getAttribute("src")) return
              audio.src = `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}`
              audio.play().catch(() => setLoading(false))
            }, 1000)
            return
          }
          setPlaying(false)
          setLoading(false)
        }}
      />

      <header className={`${styles.pad} ${styles.column} mx-auto flex h-15 w-full max-w-280 flex-none items-center justify-between gap-4`}>
        <Link href="/" className="text-[21px] font-bold tracking-[-0.03em] text-foreground no-underline">
          Go<span className="text-on-air">Cast</span>
          <span className="text-text-faint">.fm</span>
        </Link>
        {/* The owner already has a station; their way out of this page is
            back to it. */}
        {isOwner ? (
          <Link
            href={`/dashboard/stations/${station.slug}`}
            className="text-sm font-semibold whitespace-nowrap text-muted-foreground no-underline transition-colors hover:text-foreground"
          >
            Open studio →
          </Link>
        ) : (
          <Link
            href="/auth/register"
            className="text-sm font-semibold whitespace-nowrap text-muted-foreground no-underline transition-colors hover:text-foreground"
          >
            <span className="min-[420px]:hidden">Start a station →</span>
            <span className="max-[419px]:hidden">Start your own station →</span>
          </Link>
        )}
      </header>

      <main className={`${styles.pad} ${styles.main} ${styles.column} mx-auto flex w-full max-w-280 flex-1 flex-col justify-center-safe`}>
        <section className={`${styles.hero} ${styles.rise}`}>
          {/* The artwork plays too: listeners clicked it expecting it to
              (Clarity dead clicks). The card's button stays the one control
              in the tab order and the accessibility tree, so this is a mouse
              and touch shortcut, not a second Play for a screen reader. */}
          <div className={styles.artBox}>
            <button
              type="button"
              onClick={pressPlay}
              tabIndex={-1}
              aria-hidden="true"
              className={`${styles.art} relative flex flex-none cursor-pointer items-center justify-center overflow-hidden border-0 bg-[repeating-linear-gradient(135deg,var(--color-surface-raised)_0_10px,var(--color-card)_10px_20px)] p-0`}
            >
              {station.artwork_url ? (
                <Image
                  src={station.artwork_url}
                  alt=""
                  fill
                  // One entry per layout in player.module.css: wide, the short
                // phone's thumbnail, the upright tablet's column, a phone.
                sizes="(min-width: 720px) and (min-aspect-ratio: 21/20) 520px, (max-height: 739px) 104px, (min-width: 600px) 672px, 100vw"
                quality={85}
                  // `priority` is deprecated as of Next 16; the docs point at
                  // these two for the common case of "this is the hero image".
                  loading="eager"
                  fetchPriority="high"
                  className={cn("object-cover", styles.breathe, playing && styles.breatheOn)}
                />
              ) : (
                <>
                  <span className={`${styles.monogram} leading-none font-extrabold tracking-[-0.06em] text-foreground`}>
                    {initials(station.name)}
                  </span>
                  <span
                    className={`${styles.callsign} eyebrow absolute right-4.5 bottom-4 left-4.5 truncate text-left text-text-faint`}
                  >
                    {station.name}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className={`${styles.info} flex min-w-0 flex-1 flex-col gap-3`}>
            <div className={`${styles.centreRow} flex flex-wrap items-center gap-2`}>
              <StatusLamp tone={airState} variant="solid">
                {AIR_LABEL[airState]}
              </StatusLamp>
              {station.featured && (
                <span
                  className="eyebrow inline-flex h-7.5 items-center rounded-chip bg-surface-raised px-3 text-muted-foreground"
                  title="Hand-picked by GoCast"
                >
                  Featured
                </span>
              )}
            </div>

            <h1 className={`${styles.name} m-0 leading-[0.98] font-extrabold tracking-[-0.045em] text-balance`}>
              {station.name}
            </h1>

            {genres.length > 0 && (
              <div className={`${styles.genres} ${styles.centreRow} gap-1.5 overflow-hidden`}>
                {genres.map((g) => (
                  <span
                    key={g}
                    className={`${styles.genre} inline-flex flex-none rounded-chip bg-surface-raised px-3 py-1.75 text-[13px] font-semibold whitespace-nowrap`}
                  >
                    {g}
                  </span>
                ))}
                {[2, 3, 4].map(
                  (n) =>
                    genres.length > n && (
                      <span
                        key={`more-${n}`}
                        className={`${styles.more} ${styles[`more${n}`]} flex-none items-center rounded-chip bg-card px-2.5 font-mono text-xs font-semibold text-muted-foreground`}
                      >
                        +{genres.length - n}
                      </span>
                    ),
                )}
              </div>
            )}

            {station.description && (
              <p className={`${styles.desc} m-0 text-base leading-[1.45] text-muted-foreground`}>{station.description}</p>
            )}

            <div className={`${styles.centreRow} mt-auto flex flex-wrap items-center gap-2.5 pt-1`}>
              <Button variant={following ? "ghost" : "primary"} size="lg" onClick={toggleFollow} aria-pressed={following}>
                {following ? "Following" : "Follow"}
              </Button>
              <Button variant="subtle" size="lg" onClick={() => void share()}>
                {copied ? "Copied" : "Share"}
              </Button>
              {hasAbout && (
                <button
                  type="button"
                  onClick={() => setAboutOpen(true)}
                  className="min-h-11 cursor-pointer border-0 bg-transparent px-1 py-3 text-sm font-semibold text-foreground transition-colors hover:text-on-air-text"
                >
                  About ›
                </button>
              )}
            </div>
          </div>
        </section>

        <section className={`flex-none ${styles.riseLate}`}>
          {audible ? (
            <div className={`${styles.card} flex flex-col gap-3.5 rounded-card bg-on-air-tint`}>
              <div className="flex items-center gap-4">
                <div className={`${styles.ring} relative flex flex-none items-center justify-center rounded-full bg-foreground/10`}>
                  <PlayButton
                    playing={playing}
                    loading={loading}
                    onClick={pressPlay}
                    className="bg-foreground text-background hover:bg-white"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.75">
                  <span className="eyebrow truncate text-on-air-text">Now playing · {listeningLine}</span>
                  <span
                    // Keyed on the title alone: the key replays the slide-in
                    // when the TRACK changes, and an artist landing in a
                    // later update is not a new track.
                    key={nowPlaying.title ?? ""}
                    className={`${styles.trackSlideIn} truncate text-xl leading-[1.2] font-bold tracking-[-0.02em]`}
                    title={nowPlaying.title ?? undefined}
                  >
                    {nowPlaying.title ?? "Live audio"}
                  </span>
                  {nowPlaying.artist && (
                    <span className="truncate text-sm font-medium text-muted-foreground">{nowPlaying.artist}</span>
                  )}
                </div>
                {playing && (
                  <div className="hidden lg:block">
                    <VolumeControl audioRef={audioRef} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Waveform playing={playing} className="bg-on-air" />
                <p className="m-0 truncate text-center text-[13px] text-muted-foreground">
                  {loading ? "Tuning in…" : playing ? "You’re tuned in" : "Press play to tune in"}
                </p>
              </div>
            </div>
          ) : (
            // Off air is the one state with nothing to press, so it offers
            // the only useful action instead: be told when it returns.
            // From tablet width it is a row, like the on-air card: the
            // message on the left, the form filling the right.
            <div className={`${styles.card} flex flex-col gap-3.5 rounded-card bg-card sm:flex-row sm:items-center sm:gap-6`}>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-1">
                <span className="text-2xl leading-[1.05] font-extrabold tracking-[-0.03em] text-balance">
                  Nothing’s playing right now.
                </span>
                <span className="text-[15px] leading-[1.45] text-muted-foreground text-pretty">
                  Leave your email and we’ll let you know when it next goes live.
                </span>
              </div>
              <div className="sm:w-[min(26rem,50%)] sm:flex-none">
                <NotifyMeForm slug={station.slug} stationName={station.name} />
              </div>
            </div>
          )}
        </section>
      </main>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogDescription className="eyebrow text-muted-foreground">About this station</DialogDescription>
            <DialogTitle>{station.name}</DialogTitle>
          </DialogHeader>

          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span key={g} className="rounded-chip bg-surface-strong px-3 py-1.75 text-[13px] font-semibold">
                  {g}
                </span>
              ))}
            </div>
          )}

          {station.description && (
            <p className="m-0 text-base leading-normal whitespace-pre-line text-muted-foreground text-pretty">
              {station.description}
            </p>
          )}

          {/* rel carries nofollow/ugc: these are owner-supplied links on a
              public page, which is the exact shape of an SEO farm if the
              domain vouches for them. */}
          {links.length > 0 && (
            <div className="flex flex-col">
              {links.map((link, index) => (
                <a
                  key={`${link.href}-${index}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="flex min-h-12 items-center gap-3 border-t border-line text-sm font-medium text-foreground no-underline transition-colors hover:text-on-air-text"
                >
                  <link.icon size={18} className="flex-none text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{link.name}</span>
                  <IconArrowUpRight size={16} className="flex-none text-text-faint" />
                </a>
              ))}
            </div>
          )}

          {recentTracks.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="eyebrow m-0 text-muted-foreground">Just played</p>
              <ol className="m-0 flex list-none flex-col pl-0">
                {recentTracks.slice(0, MAX_RECENT_TRACKS).map((t, i) => (
                  <li key={`${t.at}-${i}`} className="flex items-baseline gap-3 border-t border-line py-3 text-sm">
                    <span className="shrink-0 font-mono text-text-faint tabular-nums">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="text-foreground">{t.title}</span>
                      {t.artist && <span className="text-muted-foreground"> — {t.artist}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
