"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type Hls from "hls.js"

export type Transport = "hls" | "icecast"

export interface NowPlaying {
  title: string | null
  artist: string | null
}

const METADATA_PLACEHOLDERS = new Set(["", "unknown", "n/a", "-", "none", "null", "untitled"])

function cleanMetadata(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (METADATA_PLACEHOLDERS.has(trimmed.toLowerCase())) return null
  return trimmed
}

/** Split the "Artist - Title" convention both ID3 and ICY use for one string. */
export function parseStreamTitle(raw: string): NowPlaying {
  const trimmed = raw.trim()
  const dash = trimmed.indexOf(" - ")
  return dash >= 0
    ? { artist: cleanMetadata(trimmed.slice(0, dash)), title: cleanMetadata(trimmed.slice(dash + 3)) }
    : { title: cleanMetadata(trimmed), artist: null }
}

interface Options {
  /** HLS media playlist, or null when no stream host is configured. */
  hlsUrl: string | null
  /** Full Icecast URL — the fallback, and the only path when hlsUrl is null. */
  icecastUrl: string
}

/**
 * Drives one <audio> element through the HLS → native HLS → Icecast ladder.
 *
 * This is the transport half of the station page's PlayerView, lifted out so
 * the embeddable player can share it without inheriting an 800-line
 * full-screen layout. PlayerView still carries its own copy for now — it had
 * uncommitted edits in flight when this was written — and should adopt this
 * hook the next time it is touched, so the ladder lives in one place.
 *
 * Playback state comes off the element's own events rather than being set
 * beside `play()`: a stall, a recovered media error, or the OS pausing us for
 * a phone call all move the UI, and `playing` can never claim audio the
 * element is not producing.
 *
 * hls.js is imported on the first play, not at module load. The embed lives
 * on other people's pages, often below the fold, and a visitor who never
 * presses play should never download a 200 KB media engine.
 */
export function useStreamPlayback({ hlsUrl, icecastUrl }: Options) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)

  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transport, setTransport] = useState<Transport | null>(null)
  const [inband, setInband] = useState<NowPlaying | null>(null)

  // Element events → state. Attached imperatively so the element itself is
  // the caller's to render and style.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlaying = () => {
      setPlaying(true)
      setLoading(false)
    }
    const onWaiting = () => setLoading(true)
    const onPause = () => setPlaying(false)
    const onStop = () => {
      setPlaying(false)
      setLoading(false)
    }

    audio.addEventListener("playing", onPlaying)
    audio.addEventListener("waiting", onWaiting)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("ended", onStop)
    audio.addEventListener("error", onStop)
    return () => {
      audio.removeEventListener("playing", onPlaying)
      audio.removeEventListener("waiting", onWaiting)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("ended", onStop)
      audio.removeEventListener("error", onStop)
    }
  }, [])

  // In-band now-playing. Both transports surface ID3 as cues on a `metadata`
  // text track — hls.js and Safari's native player each populate one — so a
  // single listener covers both. The track does not exist until the first
  // tag arrives, hence `addtrack` rather than reading textTracks once.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    function readCues(track: TextTrack) {
      const cues = track.activeCues
      if (!cues || cues.length === 0) return
      for (let i = 0; i < cues.length; i++) {
        const value = (cues[i] as unknown as { value?: { key?: string; data?: unknown; info?: string } }).value
        if (!value || typeof value.data !== "string") continue
        if (value.key === "TIT2" || value.info === "StreamTitle") {
          setInband(parseStreamTitle(value.data))
        } else if (value.key === "TPE1" && value.data.trim() !== "") {
          const artist = cleanMetadata(value.data)
          setInband((prev) => ({ title: prev?.title ?? null, artist }))
        }
      }
    }

    const listening = new Set<TextTrack>()
    function watch(track: TextTrack) {
      if (track.kind !== "metadata" || listening.has(track)) return
      listening.add(track)
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
  }, [])

  const stop = useCallback(() => {
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

    setInband(null)
    setTransport(null)
    setPlaying(false)
    setLoading(false)
  }, [])

  const start = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    setLoading(true)

    /**
     * Last resort, and a real one: a browser with neither Media Source nor
     * native HLS still has to hear the station. The transport is reported
     * honestly so this listener is counted once, by the Icecast poll,
     * rather than twice.
     */
    function playIcecast() {
      hlsRef.current?.destroy()
      hlsRef.current = null
      setTransport("icecast")
      audio!.src = icecastUrl
      audio!.play().catch(() => setLoading(false))
    }

    if (!hlsUrl) {
      playIcecast()
      return
    }

    const { default: HlsCtor } = await import("hls.js")

    // The user may have pressed stop while the module was loading.
    if (audioRef.current !== audio) return

    if (HlsCtor.isSupported()) {
      const hls = new HlsCtor({
        // A live audio stream is never seeked backwards, so holding decoded
        // audio behind the playhead only costs memory on long listens.
        backBufferLength: 30,
      })
      hlsRef.current = hls

      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        setTransport("hls")
        audio.play().catch(() => setLoading(false))
      })

      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        // The standard recovery ladder. A live stream is a moving target, so
        // a network error usually means the manifest moved on while we were
        // reading it — retrying is far more likely to work than giving up.
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
        } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
        } else {
          playIcecast()
        }
      })

      hls.loadSource(hlsUrl)
      hls.attachMedia(audio)
      return
    }

    // Safari plays HLS natively and has no Media Source for hls.js to use,
    // so this is the primary path there, not a fallback.
    if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      setTransport("hls")
      audio.src = hlsUrl
      audio.play().catch(() => playIcecast())
      return
    }

    playIcecast()
  }, [hlsUrl, icecastUrl])

  const toggle = useCallback(() => {
    if (playing || loading) stop()
    else void start()
  }, [playing, loading, start, stop])

  // Release the media engine with the component.
  useEffect(() => {
    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [])

  return { audioRef, playing, loading, transport, inband, toggle, stop }
}
