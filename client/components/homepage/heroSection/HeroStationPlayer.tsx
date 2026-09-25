"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import { IconExternalLink, IconLoader2, IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { StationArtwork } from "@/components/StationArtwork"
import { useListenerSession } from "@/hooks/useListenerSession"
import { usePublicStationFeed, type PublicStationStats } from "@/hooks/usePublicStationStats"
import styles from "./heroSection.module.css"
import { OFFICIAL_SLUG } from "./official"

/** Cycled over the meter bars. Six animations with unrelated durations, so the
    row never resolves into a visible repeating pattern. */
const WAVE_CLASSES = [styles.wave1, styles.wave2, styles.wave3, styles.wave4, styles.wave5, styles.wave6]
/** Matches the segment count of the real OnAirDeck meter, so the bars stay
    chunky enough to read as levels rather than scattered dashes. */
const WAVE_BARS = 28

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
   * the card still renders and still plays; it just loses the artwork, the
   * listener count and the on-air badge until the API answers again.
   */
  station: Station | null
  /** Shown until the first poll lands, so the card does not flash empty. */
  initialStats?: PublicStationStats
}

/**
 * The hero player, pointed at one real station.
 *
 * This replaces a mock whose every value was invented — a show, a host, a
 * listener count, and a progress bar that implied a live stream has a middle.
 * Everything here comes from the same public endpoints the station page uses,
 * so the hero is either telling the truth or visibly off air.
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
  usePublicStationFeed(station?.slug ?? null, setStats, { enabled: playing && !!station })
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
        setLoading(false)
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
      const hls = new Hls({ backBufferLength: 30, liveSyncDurationCount: 2 })
      hlsRef.current = hls

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
          if (data.response?.code === 404) { hls.destroy(); setLoading(false); setFailed(true) }
          else hls.startLoad()
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
  }, [station])

  const toggle = useCallback(() => {
    if (playing) {
      teardown()
      setPlaying(false)
      return
    }
    setPlaying(true)
    start()
  }, [playing, start, teardown])

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
  /**
   * Optimistic, and deliberately so. This badge and the meter below describe
   * THE STATION'S signal, not this browser's speaker — the station is on air
   * whether or not the visitor has pressed play, so gating them on local
   * playback made a live station look dead until you touched it.
   *
   * `known === null` therefore counts as on air: the official station is built
   * never to sign off, the server-rendered fetch normally settles it before
   * first paint, and a 404 on the manifest flips `failed` the moment anyone
   * presses play on a mount that is genuinely down. The only window where this
   * can be wrong is API-unreachable AND station-actually-off AND nobody has
   * pressed play yet.
   */
  const onAir = !offAir
  const isLive = !failed && (stats.is_live ?? station?.is_live ?? false)
  const title = stats.now_playing.title
  const artist = stats.now_playing.artist

  return (
    <div className="relative w-full max-w-[520px] mx-auto md:mx-0 md:ml-auto">
      {/* Ambient glow — kept at low opacity, composed with the hero's outer
          radial so the card sits on a soft halo rather than a hard rectangle. */}
      <div className="absolute inset-0 -z-1 translate-y-4 rounded-[28px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18),transparent_65%)] blur-2xl" aria-hidden="true" />

      <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-md p-5 md:p-6 lg:p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        {/* Status row. Three states, same distinction LiveNow draws: LIVE means
            somebody is on the microphone, ON AIR means the mount is up and
            AutoDJ is carrying it, OFF AIR means there is nothing to play. */}
        <div className="flex items-center justify-between mb-4 md:mb-5 min-h-6">
          {offAir ? (
            <div className="inline-flex items-center gap-1.5 border border-white/[0.08] px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide text-text-faint uppercase">
              <span className="w-1.5 h-1.5 bg-text-faint rounded-full" />
              Off air
            </div>
          ) : isLive ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide text-emerald-300 uppercase">
              <span className={`w-1.5 h-1.5 bg-emerald-400 rounded-full ${styles.liveDot}`} />
              Live
            </div>
          ) : onAir ? (
            <div className="inline-flex items-center gap-1.5 bg-violet-full/10 border border-violet-border/25 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide text-violet-muted uppercase">
              <span className="w-1.5 h-1.5 bg-violet-muted rounded-full" />
              On air
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-violet-full/10 border border-violet-border/25 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide text-violet-muted uppercase">
              <span className="w-1.5 h-1.5 bg-violet-muted rounded-full" />
              On air
            </div>
          )}

          {/* Unconditional, and a plain anchor rather than next/link: the slug
              is a constant, so this survives the API being down, and a hero
              link most visitors never take should not prefetch a whole route. */}
          <a
            href={`/station/${station?.slug ?? OFFICIAL_SLUG}`}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-text-secondary no-underline transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            Player page
            <IconExternalLink size={12} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>

        {/* Artwork + meta */}
        <div className="flex items-center gap-4 md:gap-5">
          {/*
            A square tile, not a record.

            The station page crops artwork into a disc because it is showing
            whatever a stranger uploaded, and a circle is a forgiving frame for
            an unknown image. This card shows exactly one known image, and that
            image is a square brand tile that already carries its own rings and
            gradient. Cropping it to a circle threw away the corners, and the
            grooves and deck rings drawn around it spent most of the card's
            visual budget on empty vinyl — the artwork ended up 88px inside a
            183px ornament, which is why it read as small and why the rings
            collided with the status pill above.

            Shown flat and square, the same footprint is all image.
          */}
          <div className="relative size-[84px] sm:size-[110px] md:size-[150px] lg:size-[170px] shrink-0 rounded-xl md:rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
            <StationArtwork
              src={OFFICIAL_ARTWORK}
              alt={station?.name ?? OFFICIAL_NAME}
              className="size-full"
              iconSize={30}
              sizes="(max-width: 640px) 84px, (max-width: 1024px) 150px, 170px"
              priority
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs tracking-widest uppercase text-violet-muted mb-2">
              {title ? "Now playing" : station?.genre ?? "GoCast"}
            </div>
            <div className="text-base md:text-xl font-semibold text-white leading-snug line-clamp-2">
              {title ?? station?.name ?? OFFICIAL_NAME}
            </div>
            <div className="text-sm md:text-[15px] text-text-muted mt-1 md:mt-1.5 truncate">
              {artist ?? (offAir ? "Back on air shortly" : "The station that never signs off")}
            </div>
          </div>
        </div>

        {/* Transport row */}
        <div className="flex items-center gap-3 mt-5 pt-4 md:mt-6 md:pt-5 border-t border-white/[0.05]">
          <button
            type="button"
            onClick={toggle}
            disabled={offAir}
            aria-label={playing ? `Pause ${station?.name ?? OFFICIAL_NAME}` : `Play ${station?.name ?? OFFICIAL_NAME}`}
            className="size-11 md:size-12 lg:size-14 rounded-full bg-violet-full text-white flex items-center justify-center shadow-[0_4px_20px_rgba(139,92,246,0.4)] shrink-0 cursor-pointer transition-all hover:brightness-110 disabled:cursor-default disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-full"
          >
            {loading && !playing ? (
              <IconLoader2 size={18} className="animate-spin" />
            ) : playing ? (
              <IconPlayerPauseFilled size={18} />
            ) : (
              <IconPlayerPlayFilled size={18} className="translate-x-px" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[13px] text-text-muted mb-2">
              <span className="truncate">
                {playing
                  ? "You're listening live"
                  : loading
                    ? "Connecting\u2026"
                    : offAir
                      ? "Nothing on air right now"
                      : "Press play \u2014 it's a real station"}
              </span>
            </div>
            {/* Not a progress bar. A live stream has no position, and the
                half-filled track that used to sit here claimed the opposite —
                that this is a recorded file with an end. The meter only moves
                while audio is playing; at rest it is a flat signal floor. */}
            <div className="flex items-end gap-[2px] h-6" aria-hidden="true">
              {Array.from({ length: WAVE_BARS }).map((_, i) => (
                <span
                  key={i}
                  className={`flex-1 h-full origin-bottom rounded-t-[1px] transition-colors ${
                    offAir
                      ? "bg-white/[0.07] scale-y-[0.18]"
                      : `${playing ? "bg-violet-muted/60" : "bg-violet-muted/25"} ${WAVE_CLASSES[i % WAVE_CLASSES.length]}`
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* One element, both transports — volume, mute and the OS media keys
            all stay attached across an hls.js teardown. */}
        <audio
          ref={audioRef}
          preload="none"
          onPlaying={() => { setLoading(false); setPlaying(true) }}
          onPause={() => setPlaying(false)}
          onError={() => { setLoading(false); setPlaying(false) }}
          className="hidden"
        />
      </div>
    </div>
  )
}
