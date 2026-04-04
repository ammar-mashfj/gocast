import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBroadcast } from '../../contexts/BroadcastContext'

const SHORTCUTS = [
  { action: 'Push to talk', key: 'Space' },
  { action: 'Play / pause', key: 'K' },
]

function formatDuration(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

interface StreamPanelProps {
  stationId: string
}

export default function StreamPanel({ stationId }: StreamPanelProps) {
  const navigate = useNavigate()
  const { state, stop, updateMetadata, engine } = useBroadcast()
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const startTimeRef = useRef(Date.now())

  // Real elapsed timer
  useEffect(() => {
    if (state !== 'live') return
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [state])

  // K key for play/pause
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'KeyK' && e.target === document.body) {
        engine?.togglePlay()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [engine])

  const isLive = state === 'live'
  const queueLen = engine?.getQueue().length ?? 0

  return (
    <div className="bg-white/[0.015] border-l border-border-subtle p-5 flex flex-col gap-4 overflow-y-auto">
      {/* Stream info */}
      <div>
        <div className="text-[10px] tracking-[2px] uppercase text-text-ghost mb-2">Stream info</div>
        <div className="flex flex-col">
          <div className="flex justify-between py-[7px] border-b border-white/[0.03]">
            <span className="text-[11px] text-text-ghost">Status</span>
            <span className={`text-[11px] ${isLive ? 'text-emerald-live' : 'text-text-muted'}`}>
              {isLive ? 'On air' : 'Offline'}
            </span>
          </div>
          <div className="flex justify-between py-[7px] border-b border-white/[0.03]">
            <span className="text-[11px] text-text-ghost">Duration</span>
            <span className="text-[11px] text-text-muted tabular-nums">{formatDuration(elapsed)}</span>
          </div>
          <div className="flex justify-between py-[7px] border-b border-white/[0.03]">
            <span className="text-[11px] text-text-ghost">Format</span>
            <span className="text-[11px] text-text-muted">WebM Opus 128kbps</span>
          </div>
          <div className="flex justify-between py-[7px]">
            <span className="text-[11px] text-text-ghost">Queue</span>
            <span className="text-[11px] text-text-muted">{queueLen} track{queueLen !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div>
        <div className="text-[10px] tracking-[2px] uppercase text-text-ghost mb-2">Metadata</div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim tracking-wide uppercase">Title</label>
            <input
              className="bg-surface-card border border-border-subtle rounded-md px-2.5 py-[7px] text-xs text-text-muted font-[inherit] outline-none focus:border-violet-muted/35 transition-colors w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => updateMetadata(title, artist)}
              placeholder="Song or show title"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim tracking-wide uppercase">Artist</label>
            <input
              className="bg-surface-card border border-border-subtle rounded-md px-2.5 py-[7px] text-xs text-text-muted font-[inherit] outline-none focus:border-violet-muted/35 transition-colors w-full"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onBlur={() => updateMetadata(title, artist)}
              placeholder="Artist or host name"
            />
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <div>
        <div className="text-[10px] tracking-[2px] uppercase text-text-ghost mb-2">Keyboard shortcuts</div>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex justify-between text-[11px]">
              <span className="text-text-ghost">{s.action}</span>
              <span className="text-text-dim px-1.5 py-0.5 bg-white/[0.03] rounded text-[10px]">{s.key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* End broadcast */}
      <button
        onClick={async () => {
          await stop()
          navigate(`/dashboard/stations/${stationId}`)
        }}
        className="flex items-center justify-center gap-1.5 py-2.5 bg-red-500/[0.08] border border-red-500/15 rounded-lg text-red-500/50 text-xs cursor-pointer hover:bg-red-500/15 hover:text-red-500/70 transition-all mt-auto"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
        End broadcast
      </button>
    </div>
  )
}
