"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import { IconExternalLink, IconLoader2, IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { createNetworkRecovery } from "@/lib/hlsRecovery"
import { createPlaylistLoader } from "@/lib/hlsPlaylistLoader"
import { StationArtwork } from "@/components/StationArtwork"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Tag } from "@/components/ds/Tag"
import { useListenerSession } from "@/hooks/useListenerSession"
import { usePublicStationFeed, type PublicStationStats } from "@/hooks/usePublicStationStats"
import { HeroLevelMeter } from "./HeroLevelMeter"
import { OFFICIAL_SLUG } from "./official"

/**
 * The official station's public mount, as a constant.
 *
 * The audio path deliberately does NOT depend on the API. This is one named,
 * singleton, public resource — the same URL in every environment, because the
 * station only exists once — so requiring a reachable API to learn a URL we
 * already know would make the homepage's most visible element fail whenever
 * the API blinks, and unplayable on any dev machine without the backend up.
 *
 * `station.hls_url` still wins when the API did answer, so if the mount ever
 * moves the server stays the source of truth and this is only the floor.
 */
const OFFICIAL_HLS = 'https://stream.gocast.fm/gocast-official-station/aac.m3u8'
const OFFICIAL_NAME = 'GoCast Official Station'

/**
 * Served from /public rather than read off the station payload.
 *
 * It is the same image, but taking it locally means the hero's artwork has no
 * API dependency, no remote round-trip in the LCP path, and is immune to
 * `next.config`'s remotePatterns — which derives its allowed host from
 * NEXT_PUBLIC_API_URL, so a local backend silently forbids the production
 * storage host and the optimizer 400s every upload.
 *
 * The trade is that re-uploading artwork in the dashboard will not move the
 * homepage until this file is replaced too. For the one station the homepage
 * hard-codes, that is the right way round: this is a brand asset, not content.
 */
const OFFICIAL_ARTWORK = '/official-station-512.png'

interface HeroStationPlayerProps {
  /**
   * Enrichment, not a dependency. Null when the API could not be reached —
   * the card still renders and still plays; it just loses the listener count
   * and the on-air badge until the API answers again.
   */
  station: Station | null
  /** Shown until the first poll lands, so the card does not flash empty. */
  initialStats?: PublicStationStats
}

/**
 * The hero player, pointed at one real station.
 *
 * Everything here comes from the same public endpoints the station page
 * uses, so the hero is either telling the truth or visibly off air.
 *
 * It is silent until clicked, deliberately. Autoplay would be blocked anyway,
 * but the stronger reason is that a homepage that starts making noise is a
 * homepage people close.
 */
export function HeroStationPlayer({ station, initialStats }: HeroStationPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  /** Which transport actually carried the audio — not which one we intended.
      useListenerSession needs the honest answer or an Icecast listener gets
      counted twice, once here and once by the server-side poll. */
  const [transport, setTransport] = useState<"hls" | "icecast" | null>(null)
  /** Set only when playback actually gave up, which is the one thing that
      proves the station is down without needing the API to say so. */
  const [failed, setFailed] = useState(false)
  const [stats, setStats] = useState<PublicStationStats>(
    initialStats ?? { count: null, is_live: null, is_on_air: null, now_playing: { title: null, artist: null } },
  )

  /**
   * Gated on `playing`, which matters more here than anywhere else this hook
   * is used. Every other consumer is a listener or an owner who chose to be
   * on the page; this one is the marketing homepage, so an ungated poll would
   * be one request every ten seconds for every bounce visitor on the site.
   * The server-side fetch already gave us a state to paint, and it is shared
   * across visitors by Next's 30s revalidate rather than paid per head.
   */
  // A failure is only evidence until the API says the mount is up again.
  const onStats = useCallback((next: PublicStationStats) => {
    setStats(next)
    if (next.is_on_air === true) setFailed(false)
  }, [])
  usePublicStationFeed(station?.slug ?? null, onStats, { enabled: playing && !!station })
  useListenerSession(station?.slug ?? "", playing, transport)

  const teardown = useCallback(() => {
    hlsRef.current?.destroy()
    hlsRef.current = null
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    setTransport(null)
    setLoading(false)
  }, [])

  useEffect(() => teardown, [teardown])

  const start = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    setLoading(true)
    setFailed(false)

    /**
     * Last resort, and a real one: a browser with neither Media Source nor
     * native HLS still has to hear the station.
     */
    const playIcecast = () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      // Only reachable when the API answered — the Icecast host is the one
      // piece of this that genuinely is deployment-specific.
      if (!station || !env.icecastUrl) {
        teardown()
        setPlaying(false)
        setFailed(true)
        return
      }
      setTransport("icecast")
      audio.src = `${env.icecastUrl}${station.icecast_mount}`
      audio.play().catch(() => { setLoading(false); setFailed(true) })
    }

    const hlsUrl = station?.hls_url ?? OFFICIAL_HLS

    if (Hls.isSupported()) {
      // A live audio stream is never seeked backwards, so holding decoded
      // audio behind the playhead only costs memory on long listens.
      // pLoader: see createPlaylistLoader (iOS reload loop after the phone wakes).
      const hls = new Hls({ backBufferLength: 30, liveSyncDurationCount: 2, pLoader: createPlaylistLoader(Hls) })
      hlsRef.current = hls
      const retryNetwork = createNetworkRecovery(hls, Hls, playIcecast)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setTransport("hls")
        audio.play().catch(() => setLoading(false))
      })
      // The same recovery ladder the station page uses. A live manifest moves
      // while you are reading it, so retrying beats giving up.
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // A 404 on the manifest is not a blip — it is what an off-air mount
          // looks like from here, and the only off-air signal available when
          // the API is unreachable.
          // Destroying hls.js mid-play fires no `pause`, so the full teardown
          // and an explicit stop are what leave the button pressable again.
          if (data.response?.code === 404) { teardown(); setPlaying(false); setFailed(true) }
          else retryNetwork()
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        else playIcecast()
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
  }, [station, teardown])

  const toggle = useCallback(() => {
    // `playing` is only ever set by the <audio> element's own `playing`
    // event, so the meter can't start before there is sound. A second press
    // while still connecting cancels.
    if (playing || loading) {
      teardown()
      setPlaying(false)
      return
    }
    start()
  }, [playing, loading, start, teardown])

  /**
   * Three-valued on purpose. `false` means the API told us the mount is down;
   * `null` means nobody has told us anything — which is the normal state on a
   * machine with no backend running, and must not be rendered as "off air"
   * when pressing play would work perfectly well.
   *
   * Audio that is actually playing outranks both: it is the only first-hand
   * evidence on the page, and `failed` is its opposite.
   */
  const known = stats.is_on_air ?? station?.is_on_air ?? null
  const offAir = failed || known === false
  const name = station?.name ?? OFFICIAL_NAME
  const title = stats.now_playing.title
  const artist = stats.now_playing.artist

  // What the transport row says. The track only shows while audio is
  // actually playing here: it comes from the poll, which only runs then.
  const line = playing && !loading
    ? title
      ? artist
        ? `${title} — ${artist}`
        : title
      : "You’re listening live"
    : loading
      ? "Connecting…"
      : offAir
        ? "Nothing on air right now"
        : "Listen in"

  return (
    <div className="flex flex-col gap-5 rounded-hero bg-card p-5 sm:p-7">
      {/* Status row. Two states, like the station page: whether a person or
          AutoDJ is on is the owner's business, so the public only sees
          ON AIR or OFF AIR. */}
      <div className="flex items-center justify-between gap-3">
        {offAir ? (
          <StatusLamp tone="off" variant="solid">Off air</StatusLamp>
        ) : (
          <StatusLamp tone="onair" variant="solid">On air</StatusLamp>
        )}
        {/* Unconditional, and a plain anchor rather than next/link: the slug
            is a constant, so this survives the API being down, and a hero
            link most visitors never take should not prefetch a whole route. */}
        <a
          href={`/station/${station?.slug ?? OFFICIAL_SLUG}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-body-sm font-semibold text-on-air-text no-underline transition-colors hover:text-foreground"
        >
          Player page
          <IconExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      {/* Artwork + meta. A square tile: the artwork is a brand tile that
          carries its own rings, so cropping it to a disc only threw away
          its corners. */}
      {/* Phone: a 104px tile and a 22px name, so "GoCast Official" fits the
          text column on one line at 360 wide and the name wraps to two lines
          that fill it; the comp's 148px tile leaves only ~120px of column
          there and the name ends up three short lines. */}
      <div className="grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[minmax(0,148px)_minmax(0,1fr)] sm:gap-6">
        <StationArtwork
          src={OFFICIAL_ARTWORK}
          alt={name}
          className="aspect-square w-full overflow-hidden rounded-well"
          iconSize={30}
          sizes="(max-width: 640px) 104px, 148px"
          priority
        />
        <div className="flex min-w-0 flex-col gap-2">
          <Tag className="self-start font-mono uppercase tracking-widest text-foreground">Official</Tag>
          <span className="font-display text-title-sm sm:text-title-lg sm:text-balance">{name}</span>
          <span className="text-body text-muted-foreground">
            {offAir ? "Back on air shortly" : "The station that never signs off"}
          </span>
        </div>
      </div>

      {/* Transport well */}
      <div className="flex items-center gap-4 rounded-card bg-surface-inset p-4">
        <button
          type="button"
          onClick={toggle}
          // Not `offAir`: a failed attempt must stay retryable, and only the
          // API saying the mount is down is reason enough to refuse a press.
          disabled={known === false && !playing && !loading}
          aria-label={playing ? `Pause ${name}` : `Play ${name}`}
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] duration-150 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.96] disabled:opacity-45"
        >
          {loading ? (
            <IconLoader2 size={20} className="animate-spin" />
          ) : playing ? (
            <IconPlayerPauseFilled size={20} />
          ) : (
            <IconPlayerPlayFilled size={20} className="ml-0.5" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="truncate font-display text-base font-bold">{line}</span>
          {playing && !loading ? (
            /* Not a progress bar. A live stream has no position; a level
               meter is the only honest shape, and it only moves while audio
               is actually playing. */
            <HeroLevelMeter />
          ) : (
            <span className="text-body-sm text-text-faint">
              {offAir ? "The official station is between shows." : "Press play — it’s a real station"}
            </span>
          )}
        </div>
      </div>

      {/* One element, both transports — volume, mute and the OS media keys
          all stay attached across an hls.js teardown. */}
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => { setLoading(false); setPlaying(true) }}
        onWaiting={() => setLoading(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setLoading(false); setPlaying(false) }}
      />
    </div>
  )
}
