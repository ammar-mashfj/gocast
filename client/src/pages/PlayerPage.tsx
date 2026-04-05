import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/axios'
import type { Station } from '../types/station'
import { StreamPlayer } from '../lib/streamPlayer'
import Noise from '../components/Noise'

const EQ_CLASSES = [
  'animate-bar-1', 'animate-bar-2', 'animate-bar-3', 'animate-bar-4',
  'animate-bar-5', 'animate-bar-6', 'animate-bar-7', 'animate-bar-8',
  'animate-bar-9', 'animate-bar-10', 'animate-bar-11', 'animate-bar-12',
] as const

function Vinyl({ playing }: { playing: boolean }) {
  return (
    <div className="relative w-[200px] h-[200px] md:w-[320px] md:h-[320px] animate-vinyl-float">
      <div className={`w-full h-full rounded-full bg-[conic-gradient(from_0deg,#1a1a2e,#16162a,#1a1a2e,#0f0f1f,#1a1a2e,#16162a,#1a1a2e)] flex items-center justify-center relative border border-white/5 ${playing ? 'animate-vinyl-spin' : ''}`}>
        <div className="absolute w-[87.5%] h-[87.5%] rounded-full border border-white/[0.04]" />
        <div className="absolute w-[75%] h-[75%] rounded-full border border-white/[0.03]" />
        <div className="w-[50%] h-[50%] rounded-full bg-gradient-to-br from-[#1a0533] via-[#2d1b69] to-[#1a0533] flex items-center justify-center border-2 border-white/10 relative overflow-hidden">
          <span className="text-[28px] md:text-[42px] opacity-70">♫</span>
          <div className="absolute w-3 h-3 bg-dark-surface rounded-full border border-white/10" />
        </div>
      </div>
    </div>
  )
}

function EqBars({ playing }: { playing: boolean }) {
  if (!playing) return null
  return (
    <div className="flex items-end gap-[3px] h-11 mb-6">
      {EQ_CLASSES.map((cls) => (
        <div key={cls} className={`w-1 rounded-sm bg-violet-full/80 ${cls}`} />
      ))}
    </div>
  )
}

function ShareButtons({ slug }: { slug: string }) {
  const url = new URL(`/station/${slug}`, import.meta.env.VITE_APP_URL).href
  const btn = 'w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center cursor-pointer text-text-secondary hover:bg-white/[0.12] transition-colors'

  return (
    <div className="flex items-center gap-3">
      <button onClick={() => window.open(`https://x.com/intent/tweet?text=Listening+to+${url}`, '_blank')} className={btn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
      </button>
      <button onClick={() => navigator.clipboard.writeText(url)} className={btn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
      </button>
    </div>
  )
}

function WaveDecoration() {
  const d = "M0 20 Q25 5 50 20 T100 20 T150 20 T200 20 T250 20 T300 20 T350 20 T400 20 T450 20 T500 20 T550 20 T600 20 T650 20 T700 20 T750 20 T800 20 T850 20 T900 20 T950 20 T1000 20 T1050 20 T1100 20 T1150 20 T1200 20"
  return (
    <div className="absolute bottom-[60px] left-0 right-0 h-10 overflow-hidden z-[1] opacity-[0.06]">
      <div className="flex animate-wave">
        <svg width="1200" height="40" viewBox="0 0 1200 40"><path d={d} fill="none" stroke="white" strokeWidth="1.5" /></svg>
        <svg width="1200" height="40" viewBox="0 0 1200 40"><path d={d} fill="none" stroke="white" strokeWidth="1.5" /></svg>
      </div>
    </div>
  )
}

export default function PlayerPage() {
  const { slug } = useParams<{ slug: string }>()
  const [station, setStation] = useState<Station | null>(null)
  const [playing, setPlaying] = useState(false)
  const [listeners, setListeners] = useState(0)
  const [notFound, setNotFound] = useState(false)
  const playerRef = useRef<StreamPlayer | null>(null)

  // Fetch station
  useEffect(() => {
    api.get(`/public/stations/${slug}`)
      .then((res) => setStation(res.data.data))
      .catch(() => setNotFound(true))
  }, [slug])

  // Poll listener count
  useEffect(() => {
    if (!slug) return
    function fetchListeners() {
      api.get(`/public/stations/${slug}/listeners`)
        .then((res) => {
          setListeners(res.data.data?.count ?? 0)
          setStation((prev) => prev ? { ...prev, is_live: res.data.data?.is_live ?? prev.is_live } : prev)
        })
        .catch(() => {})
    }
    fetchListeners()
    const timer = setInterval(fetchListeners, 10000)
    return () => clearInterval(timer)
  }, [slug])

  const togglePlay = useCallback(() => {
    if (!station) return

    if (playing && playerRef.current) {
      playerRef.current.stop()
      playerRef.current = null
      return
    }

    const player = new StreamPlayer({
      onStateChange: setPlaying,
      onError: (msg) => console.error('Stream error:', msg),
    })

    playerRef.current = player
    const streamUrl = `${import.meta.env.VITE_ICECAST_URL}${station.icecast_mount}`
    player.play(streamUrl)
  }, [station, playing])

  // Cleanup on unmount
  useEffect(() => {
    return () => playerRef.current?.stop()
  }, [])

  if (notFound) {
    return (
      <div className="min-h-screen bg-dark-surface text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-medium text-text-secondary mb-2">Station not found</h1>
          <p className="text-text-muted mb-6">This station doesn't exist or has been removed.</p>
          <Link to="/" className="text-violet-muted no-underline hover:text-violet">Go to homepage</Link>
        </div>
      </div>
    )
  }

  if (!station) return null

  return (
    <div className="relative min-h-screen bg-dark-surface text-white flex flex-col md:grid md:grid-cols-2 overflow-hidden">
      {!station.is_live && <Noise opacity={0.06} grainSize={2} fps={16} className="z-[1]" />}
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.15)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute -bottom-[10%] -left-[10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1)_0%,transparent_70%)] pointer-events-none" />
      <div className="hidden md:block absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-violet-full/15 to-transparent z-[1]" />
      <div className="hidden md:block absolute top-6 right-6 text-[11px] tracking-[4px] uppercase text-text-dim z-[3]" style={{ writingMode: 'vertical-rl' }}>
        internet radio
      </div>

      <div className="relative flex items-center justify-center p-8 pt-12 md:p-12 z-2">
        <Vinyl playing={playing} />
      </div>

      <div className="relative flex flex-col items-center md:items-start justify-center px-6 md:pr-12 md:pl-4 py-6 md:py-12 z-2">
        <EqBars playing={playing} />

        {station.is_live && (
          <div className="inline-flex items-center gap-1.5 bg-[rgba(255,59,48,0.15)] text-[#ff3b30] text-[11px] font-medium tracking-[2px] uppercase px-3.5 py-1.5 rounded-full mb-4 w-fit">
            <div className="w-2 h-2 bg-[#ff3b30] rounded-full animate-live-btn" />
            LIVE
          </div>
        )}

        {station.genre && (
          <div className="text-xs tracking-[3px] uppercase text-violet-full/80 font-medium mb-3">
            {station.genre}
          </div>
        )}

        <h1 className="text-3xl md:text-5xl font-medium -tracking-wide leading-[1.1] text-text-primary mb-3 text-center md:text-left">
          {station.name}
        </h1>

        {station.description && (
          <p className="text-[15px] text-text-muted leading-relaxed mb-8 max-w-[340px] text-center md:text-left">
            {station.description}
          </p>
        )}

        {station.is_live && (
          <div className="flex items-center gap-3 mb-10 px-4 py-3 bg-white/[0.04] rounded-xl border border-border-faint w-full md:w-auto">
            <div>
              <div className="text-[11px] tracking-[1.5px] uppercase text-text-muted mb-0.5">Now playing</div>
              <div className="text-[15px] font-medium text-text-secondary">{station.name}</div>
              <div className="text-[13px] text-text-muted">Live broadcast</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 mb-8">
          <button
            onClick={togglePlay}
            className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-violet flex items-center justify-center shrink-0 border-none cursor-pointer hover:scale-[1.08] hover:bg-violet-full transition-all"
          >
            {playing ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="8,4 20,12 8,20" /></svg>
            )}
          </button>

          {!station.is_live && !playing && (
            <span className="text-sm text-text-muted">Station is offline</span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {station.is_live && (
            <div className="flex items-center gap-2 text-[13px] text-text-muted">
              <div className="w-1.5 h-1.5 bg-emerald-live rounded-full" />
              {listeners.toLocaleString()} listening
            </div>
          )}
          <ShareButtons slug={station.slug} />
        </div>
      </div>

      <WaveDecoration />

      <div className="relative md:absolute bottom-0 left-0 right-0 px-6 md:px-12 py-4 flex flex-col md:flex-row justify-between items-center gap-2 z-[3] border-t border-white/5 mt-auto">
        <div className="text-xs text-text-ghost">
          Powered by <Link to="/" className="text-violet-muted no-underline">GoCast.fm</Link> — Start your own station →
        </div>
        <div className="text-xs text-text-ghost hidden md:block">{new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href}</div>
      </div>
    </div>
  )
}
