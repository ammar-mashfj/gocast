"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  IconShare3,
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
  IconCalendarClock,
  IconRosetteDiscountCheckFilled,
  IconX,
} from "@tabler/icons-react"
import Image from "next/image"
import Hls from "hls.js"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { shareOrCopy } from "@/lib/share"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useIsMobile } from "@/hooks/use-mobile"
import { useListenerSession } from "@/hooks/useListenerSession"
import { isSaved, toggleSaved, recordListen, subscribeLibrary } from "@/lib/listenerLibrary"
import { NotifyMeForm } from "./NotifyMeForm"
import { ScheduleList } from "./ScheduleBlock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import styles from "./player.module.css"

const METADATA_PLACEHOLDERS = new Set(["", "unknown", "n/a", "-", "none", "null", "untitled"])

/** Max prior tracks kept in memory and shown under "Just played". */
const MAX_RECENT_TRACKS = 5

/** Uppercase micro-label, the typographic signature of this page. */
const MICRO = "font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground"

/** Pill button in the actions row — outline that warms to the brand on hover. */
const PILL =
  "inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[#2a2344] text-foreground text-sm font-medium " +
  "cursor-pointer bg-transparent transition-colors hover:border-primary hover:text-white " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "@max-[520px]/player:h-11 @max-[520px]/player:flex-auto @max-[520px]/player:justify-center"

function cleanMetadata(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (METADATA_PLACEHOLDERS.has(trimmed.toLowerCase())) return null
  return trimmed
}

/**
 * The record.
 *
 * Two bare rings sit outside the disc itself, so the artwork reads as a record
 * on a deck rather than a circle cropped to the column — they are the part of
 * the composition that survives when the page narrows and everything else
 * stacks.
 *
 * It does not spin. A turning disc is the obvious thing to do with a record,
 * but the surface that turns here is the station's own artwork — often a
 * wordmark, often a face — and rotating it makes the one image that carries
 * the station's identity hard to read, permanently, on the page where a
 * stranger decides whether to follow. Nothing was gained for that: playback
 * already announces itself through the dock equaliser, the pause icon, the
 * listener count and the tab title, so the rotation was a fourth copy of a
 * signal that was never in doubt.
 *
 * The float stays. It moves the disc without turning it, so the artwork stays
 * legible the whole way through — motion that costs nothing to read.
 */
function Vinyl({ artworkUrl }: { artworkUrl?: string | null }) {
  return (
    <div className={`relative w-full aspect-square ${styles.vinylFloat}`}>
      <div className="absolute -inset-[14%] rounded-full border border-[#2a2344]" aria-hidden />
      <div className="absolute -inset-[7%] rounded-full border border-[#3b2f6b]/60" aria-hidden />
      <div className="size-full rounded-full bg-[conic-gradient(from_0deg,#1a1a2e,#16162a,#1a1a2e,#0f0f1f,#1a1a2e,#16162a,#1a1a2e)] flex items-center justify-center relative border border-white/5 shadow-[0_40px_100px_rgba(139,92,246,0.25)]">
        <div className="absolute w-[87.5%] h-[87.5%] rounded-full border border-white/[0.04]" />
        <div className="absolute w-[75%] h-[75%] rounded-full border border-white/[0.03]" />
        <div className="w-[50%] h-[50%] rounded-full bg-gradient-to-br from-[#1a0533] via-[#2d1b69] to-[#1a0533] flex items-center justify-center border-2 border-white/10 relative overflow-hidden">
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt="Station artwork"
              fill
              sizes="(max-width: 520px) 80px, (max-width: 900px) 120px, 170px"
              // `priority` is deprecated as of Next 16; the docs point at these
              // two for the common case of "this is the hero image".
              loading="eager"
              fetchPriority="high"
              className="object-cover"
            />
          ) : (
            <IconMusic className="size-9 @min-[900px]/player:size-12 text-violet-300/70" strokeWidth={1.5} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Dock equaliser — four bars, staggered.
 *
 * Gated on `playing` rather than running always: the dock is now permanently on
 * screen, so bars that danced through a paused stream would be claiming audio
 * is flowing at the exact moment it is not.
 */
function DockEq({ playing }: { playing: boolean }) {
  return (
    <span className="inline-flex items-end gap-[2px] h-3 shrink-0" aria-hidden>
      {[0, 0.25, 0.5, 0.1].map((delay, i) => (
        <span
          key={i}
          className={`w-[3px] h-3 rounded-[1px] bg-primary ${styles.dockBar} ${playing ? styles.dockBarOn : ""}`}
          style={playing ? { animationDelay: `${delay}s` } : undefined}
        />
      ))}
    </span>
  )
}

/**
 * What the station is doing, as one word.
 *
 * Three states, not two. `is_on_air` means audio is reaching listeners and
 * `is_live` means a person is producing it — so a station running AutoDJ is
 * on air with nobody at the mic, and that is the common case on a paid plan,
 * not an edge one. Painting it in the same grey as a silent station said the
 * opposite of the label sitting next to it.
 */
type AirState = "live" | "onair" | "off"

const AIR_LABEL: Record<AirState, string> = { live: "Live", onair: "On air", off: "Off air" }

const AIR_TITLE: Record<AirState, string> = {
  live: "A broadcaster is on air right now",
  onair: "Playing, but nobody is at the mic",
  off: "Nothing is streaming right now",
}

/**
 * Red for a human, green for audio, grey for silence.
 *
 * Only red breathes. The ring is what makes someone look, so it is spent on
 * the one state worth interrupting for — a live broadcaster — rather than on
 * a rotation that will still be there in an hour.
 */
function LiveDot({ state }: { state: AirState }) {
  const fill =
    state === "live" ? "bg-red-500" : state === "onair" ? "bg-emerald-500" : "bg-muted-foreground/60"

  return (
    <span className="relative w-2 h-2 inline-block shrink-0" aria-hidden>
      <span className={`absolute inset-0 rounded-full ${fill}`} />
      {state === "live" && (
        <span className={`absolute inset-0 rounded-full bg-red-500 ${styles.liveRing}`} />
      )}
    </span>
  )
}

/**
 * Follow / share row.
 *
 * Labelled pills rather than bare icons. The icons alone were unlabelled glyphs
 * competing with the play button for the same "press me" reading; with words on
 * them they become what they are — secondary actions you take after deciding
 * you like the station.
 *
 * One share button, not one per network. `navigator.share` opens the viewer's
 * own share sheet, which already lists every app they actually use and orders
 * it by who they actually talk to — a row of hardcoded logos cannot match that
 * and has to be maintained as each network changes its intent URL. Instagram
 * has no web share intent at all, and Facebook's ignores pre-filled text, so
 * of the obvious candidates only X was ever implementable as a button; being
 * restricted to the one network that happens to have a working URL is a poor
 * reason to show it.
 *
 * Where the API is missing — Firefox, Chrome on Linux — this copies instead
 * and says so, which is what the row did before for everything but X.
 */
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
    <div className="flex flex-wrap items-center gap-2.5 mt-1.5 @max-[900px]/player:justify-center">
      <button
        type="button"
        onClick={handleToggleSave}
        aria-pressed={saved}
        className={`${PILL} ${saved ? "border-primary/60 text-white" : ""}`}
      >
        {saved ? <IconHeartFilled size={16} className="text-rose-400" /> : <IconHeart size={16} />}
        {saved ? "Following" : "Follow"}
      </button>
      <button
        type="button"
        onClick={() => {
          void shareOrCopy(url, station.name, `Listening to ${station.name} on GoCast`)
        }}
        className={PILL}
      >
        <IconShare3 size={16} />
        Share
      </button>
    </div>
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

/** Shared by both forms below, so the two can never drift apart in style. */
const PANEL_TITLE = "font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground"

const PANEL_SURFACE = "border border-[#2a2344] bg-[#161228]/95 text-sm text-foreground backdrop-blur-xl"

/**
 * Secondary station detail — the bio, the week, the last few tracks.
 *
 * These were inline disclosures once, and on a vertically centred layout that
 * was the wrong shape: opening one grew its column, which re-centred the whole
 * composition — the artwork and the buttons moved to make room for a list
 * nobody was looking at yet. Both forms below cost the page no height at all.
 *
 * Which form depends on the screen, because the right answer genuinely
 * differs. On a phone a centred box puts its content and its close button in
 * the middle and top of a tall screen, the two places a thumb reaches worst,
 * so the panel is anchored to the bottom edge instead — beside the dock the
 * schedule was opened from. On a laptop that same panel would stretch the full
 * width of the window to hold three rows of a timetable, so there it is a
 * centred dialog sized to its contents.
 *
 * Both are the same Radix primitive underneath — `Sheet` is `Dialog` anchored
 * to an edge — so focus trapping, Escape, and the overlay behave identically
 * either way. Only placement changes.
 *
 * The breakpoint is the viewport, not the player's container, because these
 * render through a portal on `document.body` and a container query would never
 * reach them.
 */
function StationSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
}) {
  // Resolves on mount rather than on open, and every panel starts closed, so
  // the one-frame "assume desktop" this returns before its effect runs is
  // never a frame anybody sees.
  const isMobile = useIsMobile()

  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`${PANEL_SURFACE} gap-3 p-5 ring-0 sm:max-w-lg`}>
          <DialogHeader>
            {/* Clear of the close button Radix parks in the corner — which is
                the right place for it here, the dialog being only as wide as
                its contents. */}
            <DialogTitle className={`${PANEL_TITLE} pr-8`}>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // The sheet spans the viewport, but its contents are a column. Radix's
        // own close button would pin itself to the far corner of that span,
        // half a screen from the thing it closes, so it is switched off and
        // re-placed beside the title instead.
        showCloseButton={false}
        className={`${PANEL_SURFACE} ${styles.sheetBody} max-h-[80dvh] overflow-y-auto rounded-t-2xl border-x-0 border-b-0`}
      >
        <div className="mx-auto w-full max-w-2xl">
          <SheetHeader className="flex-row items-center justify-between gap-4 px-0 pt-0 pb-2">
            <SheetTitle className={PANEL_TITLE}>{title}</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1 shrink-0 rounded-full">
                <IconX size={16} />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </SheetHeader>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function WaveDecoration() {
  const d = "M0 20 Q25 5 50 20 T100 20 T150 20 T200 20 T250 20 T300 20 T350 20 T400 20 T450 20 T500 20 T550 20 T600 20 T650 20 T700 20 T750 20 T800 20 T850 20 T900 20 T950 20 T1000 20 T1050 20 T1100 20 T1150 20 T1200 20"
  return (
    <div className="absolute bottom-[22%] left-0 right-0 h-10 overflow-hidden opacity-[0.06]">
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
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [descOpen, setDescOpen] = useState(false)
  const [descClamped, setDescClamped] = useState(false)
  const descRef = useRef<HTMLParagraphElement | null>(null)
  // The "more" trigger only earns its place when the text is genuinely being
  // cut off, so measure rather than guess: a two-line bio gets no control at
  // all. Re-measured on resize and once webfonts land, since both change how
  // many lines the same string takes.
  //
  // The paragraph is now clamped at all times — the full text lives in a sheet
  // — so this no longer has to skip a measurement while expanded.
  useEffect(() => {
    const el = descRef.current
    if (!el) return
    let cancelled = false
    const measure = () => {
      if (!cancelled) setDescClamped(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [station.description])

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

  /** There is audio to hear — a broadcaster, AutoDJ, or a stream already open. */
  const audible = station.is_on_air || playing || loading || nowPlaying.title !== null

  const airState: AirState = station.is_live ? "live" : station.is_on_air ? "onair" : "off"

  return (
    // Container queries rather than viewport breakpoints. The player reflows
    // against the width of its own box, so it stays correct wherever it is put
    // — the full page today, a narrower shell tomorrow — without every rule
    // having to be re-derived from the viewport it happens to be sitting in.
    // (The Pro embed has its own component; this does not drive it.)
    <div className="@container/player relative flex min-h-dvh flex-col bg-[#0b0a10] text-foreground">
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

      {/* Decoration, clipped by its own layer. Keeping the overflow here rather
          than on the root is what lets the dock below use `position: sticky` —
          an `overflow` on an ancestor would turn that into a scroll container
          and the dock would stop sticking to the viewport. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(1200px_600px_at_20%_0%,#1a1530_0%,#0b0a10_60%)]"
        aria-hidden
      >
        <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)]" />
        <div className="absolute -bottom-[10%] -left-[10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_70%)]" />
        <WaveDecoration />
      </div>

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-8 py-5 @max-[520px]/player:p-4">
        {/* Owner-only chip — quick path back to the studio for station owners
            previewing their own player page. */}
        {isOwner && (
          <Link
            href={`/dashboard/stations/${station.slug}`}
            className="inline-flex items-center gap-2 rounded-full border border-[#3b2f6b] bg-[#17122b] px-3.5 py-2 text-[13px] font-medium text-violet no-underline transition-colors hover:border-primary hover:bg-[#1f1145]"
          >
            <IconBroadcast size={14} />
            You own this — Open studio
          </Link>
        )}

        <div className={`${MICRO} ml-auto flex items-center gap-6`}>
          <span className="@max-[520px]/player:hidden">Internet radio</span>
          <span
            className={`inline-flex items-center gap-2.5 ${airState === "off" ? "" : "text-foreground"}`}
            title={AIR_TITLE[airState]}
          >
            <LiveDot state={airState} />
            {AIR_LABEL[airState]}
          </span>
        </div>
      </header>

      <main className={`${styles.mainStack} relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(220px,340px)_minmax(0,1fr)] items-center gap-[clamp(32px,6vw,96px)] px-8 py-[clamp(24px,5vh,64px)] @max-[900px]/player:grid-cols-[minmax(0,1fr)] @max-[900px]/player:justify-items-center @max-[900px]/player:gap-7 @max-[900px]/player:pt-4 @max-[900px]/player:text-center @max-[520px]/player:px-5`}>
        {/* The phone cap is height-aware, not a flat number. Stacked, this
            column is well short of a tall screen, and the leftover had to go
            somewhere — as a hole above the dock, or split either side of the
            content; neither reads as deliberate. Letting the artwork take it
            instead spends the space on the one thing the page is selling. The
            `min()` is what keeps that honest on a short screen: 30dvh gives
            the disc back when there is no height to spare, rather than
            pushing the play button off the bottom. */}
        <div className="w-full max-w-[340px] justify-self-end @max-[900px]/player:max-w-[240px] @max-[900px]/player:justify-self-center @max-[520px]/player:max-w-[min(240px,30dvh)]">
          <Vinyl artworkUrl={station.artwork_url} />
        </div>

        <div className="flex min-w-0 flex-col gap-5 @max-[900px]/player:items-center @max-[520px]/player:gap-3.5">
          {station.genre && (
            <p className={`${MICRO} m-0 max-w-[46ch] leading-[1.7] text-primary/90 text-pretty`}>
              {station.genre}
            </p>
          )}

          {/* The featured mark rides with the station's NAME rather than the
              eyebrow: it is a property of this station, the way a verified tick
              is, not another label about its content. Icon only — the meaning
              is carried by the tooltip for a mouse and by the sr-only text for
              everyone else, so the name keeps the line to itself. */}
          <h1 className="m-0 text-[clamp(48px,7vw,96px)] font-semibold leading-[0.95] tracking-[-0.03em] text-balance @max-[900px]/player:text-[clamp(40px,11cqw,72px)] @max-[520px]/player:text-[40px]">
            {station.name}
            {station.featured && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 inline-flex align-middle text-primary">
                      <IconRosetteDiscountCheckFilled className="size-5 @min-[900px]/player:size-8" />
                      <span className="sr-only">Featured station</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Hand-picked by GoCast</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </h1>

          {/* Description — permanently clamped to three lines; the whole bio
              is a sheet away. Expanding it in place was the last control that
              could still move the artwork, and it moved it for the longest
              text on the page. */}
          {station.description && (
            <div className="w-full max-w-[56ch]">
              <p
                ref={descRef}
                className="m-0 line-clamp-3 text-[18px] leading-[1.55] text-[#b8b3c9] text-pretty @max-[520px]/player:text-[15px]"
              >
                {station.description}
              </p>
              {descClamped && (
                <button
                  type="button"
                  onClick={() => setDescOpen(true)}
                  className={`${MICRO} mt-1.5 flex w-fit cursor-pointer border-0 bg-transparent p-0 tracking-[0.14em] transition-colors hover:text-foreground @max-[900px]/player:mx-auto`}
                >
                  Read more
                </button>
              )}
            </div>
          )}

          {/* Off air is the one state with nothing to press, so it says so and
              offers the only useful action instead: be told when it returns. */}
          {!audible && (
            <div className="flex flex-col items-start gap-2 @max-[900px]/player:items-center">
              <Badge variant="secondary" className="px-4 py-2 text-sm">
                <span className="mr-2 size-1.5 rounded-full bg-muted-foreground/60" />
                Off air
              </Badge>
              <NotifyMeForm slug={station.slug} stationName={station.name} />
            </div>
          )}

          <ShareButtons station={station} />

          {/* Recently played — button disclosure so open *and* close can animate (unlike native <details>). */}
          {recentTracks.length > 0 && (
            <button
              type="button"
              onClick={() => setJustPlayedOpen(true)}
              className={`${MICRO} inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 transition-colors hover:text-foreground`}
            >
              Just played
              <span className="normal-case tracking-normal text-text-faint">· {recentTracks.length}</span>
            </button>
          )}

        </div>
      </main>

      <StationSheet open={descOpen} onOpenChange={setDescOpen} title={`About ${station.name}`}>
        <p className="m-0 text-[15px] leading-[1.6] whitespace-pre-line text-[#b8b3c9]">
          {station.description}
        </p>
      </StationSheet>

      <StationSheet open={scheduleOpen} onOpenChange={setScheduleOpen} title="Weekly schedule">
        <ScheduleList schedules={station.schedules ?? []} timezone={station.timezone} />
      </StationSheet>

      <StationSheet open={justPlayedOpen} onOpenChange={setJustPlayedOpen} title="Just played">
        <ol className="flex list-none flex-col gap-0 pl-0">
          {recentTracks.slice(0, MAX_RECENT_TRACKS).map((t, i) => (
            <li
              key={`${t.at}-${i}`}
              className="flex items-baseline gap-3 border-b border-[#2a2344] py-3 text-sm last:border-b-0"
            >
              <span className="shrink-0 tabular-nums text-text-faint">{i + 1}</span>
              <span className="min-w-0">
                <span className="text-foreground">{t.title}</span>
                {t.artist && <span className="text-muted-foreground"> — {t.artist}</span>}
              </span>
            </li>
          ))}
        </ol>
      </StationSheet>

      {/* ── Transport dock ────────────────────────────────────────────────────
          Sticky, not fixed: it reserves its own height at the end of the page
          so nothing underneath needs a hand-tuned bottom padding to clear it,
          and it still pins to the bottom of the viewport for the whole scroll. */}
      <div className={`${styles.dock} sticky bottom-0 z-20 px-6 @max-[520px]/player:px-2.5`}>
        <div className="mx-auto flex max-w-[1176px] flex-col gap-2.5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-5 rounded-[20px] border border-[#2a2344] bg-[#161228]/85 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-[18px] @max-[900px]/player:grid-cols-[auto_minmax(0,1fr)_auto] @max-[520px]/player:gap-3 @max-[520px]/player:rounded-2xl @max-[520px]/player:p-3">
            <Button
              size="icon"
              onClick={togglePlay}
              disabled={!audible}
              aria-label={playing ? "Pause" : loading ? "Connecting" : "Play"}
              className={`size-16 rounded-full shadow-[0_0_0_8px_rgba(139,92,246,0.18),0_12px_32px_rgba(139,92,246,0.45)] disabled:opacity-40 @max-[520px]/player:size-13 ${audible && !playing && !loading ? styles.playPulse : ""}`}
            >
              {loading ? (
                <IconLoader2 size={26} className="animate-spin" />
              ) : playing ? (
                <IconPlayerPauseFilled size={26} />
              ) : (
                <IconPlayerPlayFilled size={26} />
              )}
            </Button>

            <div className="flex min-w-0 flex-col gap-1.5 text-left">
              <div className={`${MICRO} flex items-center gap-3`}>
                <DockEq playing={playing} />
                {/* "Now playing / Off air" reads as a contradiction, so the
                    label follows the station rather than being a fixed word. */}
                <span>{audible ? "Now playing" : "Off air"}</span>
                {audible && (
                  <span className="inline-flex items-center gap-1.5 font-sans text-[13px] normal-case tracking-normal text-[#b8b3c9]">
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                    {listeners.toLocaleString()} listening
                  </span>
                )}
              </div>
              <div
                key={`${nowPlaying.title ?? ""}|${nowPlaying.artist ?? ""}`}
                className={`truncate text-[17px] font-medium @max-[520px]/player:text-[15px] ${styles.trackSlideIn}`}
                title={nowPlaying.artist ? `${nowPlaying.title} — ${nowPlaying.artist}` : nowPlaying.title ?? undefined}
              >
                {nowPlaying.title ?? (playing ? "Live audio" : audible ? "Press play to tune in" : "Nothing playing right now")}
                {nowPlaying.artist && (
                  <span className="ml-2 text-[13px] font-normal text-muted-foreground">{nowPlaying.artist}</span>
                )}
              </div>
            </div>

            {/* Volume is desktop-only on purpose: a phone has hardware keys for
                this, and the slider would cost the dock a third of its width on
                the screen that can least afford it. */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] @max-[900px]/player:hidden ${
                playing ? "max-w-32 translate-x-0 opacity-100" : "pointer-events-none max-w-0 -translate-x-1.5 opacity-0"
              }`}
              aria-hidden={!playing}
            >
              <VolumeControl audioRef={audioRef} />
            </div>

            {/* The way into the schedule, at every width — no next-live line
                beside it any more. That line was a second date and time on a
                bar whose job is the current track, and it had to be arranged
                differently at each breakpoint to fit. What a reader wants from
                it is the week, which is one press away either way.

                Label collapses to the icon below 520px: spelled out it costs
                roughly a third of the dock's width, and the track title is
                what should have that room. */}
            {(station.schedules ?? []).length > 0 && (
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                aria-label="Full schedule"
                // Collapsed to its icon, the hit area would be 16×24 — well
                // under the ~44px a thumb needs, and on the one layout that is
                // only ever touched. The square below 520px is the tap target,
                // not the glyph.
                className={`${MICRO} flex cursor-pointer items-center gap-2 border-0 border-l border-[#2a2344] bg-transparent py-1 pl-5 tracking-[0.14em] text-violet-muted transition-colors hover:text-violet @max-[520px]/player:size-11 @max-[520px]/player:justify-center @max-[520px]/player:border-l-0 @max-[520px]/player:p-0`}
              >
                <IconCalendarClock size={16} stroke={1.75} />
                <span className="@max-[520px]/player:sr-only">Full schedule</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-1.5 text-[13px] text-muted-foreground @max-[520px]/player:justify-center">
            <span className="@max-[520px]/player:hidden">
              Powered by{" "}
              <Link href="/" className="font-medium text-[#b8b3c9] no-underline hover:underline">
                GoCast
              </Link>
            </span>
            <Link
              href="/auth/register"
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#3b2f6b] bg-[#17122b] px-3.5 text-[13px] font-medium text-violet no-underline transition-colors hover:border-primary hover:text-white"
            >
              Launch your own station →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
