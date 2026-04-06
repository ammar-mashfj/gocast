import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useBroadcast } from '../../contexts/BroadcastContext'
import api from '../../lib/axios'
import type { Station } from '../../types/station'
import { IconPlayerStopFilled } from '@tabler/icons-react'

const SHORTCUTS = [
  { action: 'Push to talk', key: 'Space' },
  { action: 'Play / pause', key: 'K' },
  { action: 'Next track', key: 'N' },
  { action: 'Previous track', key: 'P' },
  { action: 'Toggle repeat', key: 'R' },
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
  const { state, stop, engine } = useBroadcast()
  const [elapsed, setElapsed] = useState(0)
  const [station, setStation] = useState<Station | null>(null)
  const [copied, setCopied] = useState(false)
  const startTimeRef = useRef(Date.now())

  // Fetch station data for stream URL
  useEffect(() => {
    api.get(`/stations/${stationId}`).then((res) => setStation(res.data.data))
  }, [stationId])

  const streamUrl = station
    ? `${import.meta.env.VITE_ICECAST_URL}${station.icecast_mount}`
    : ''

  function copyStreamUrl() {
    if (!streamUrl) return
    navigator.clipboard.writeText(streamUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Real elapsed timer
  useEffect(() => {
    if (state !== 'live') return
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [state])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target !== document.body) return
      const queueLen = engine?.getQueue().length ?? 0
      const currentIdx = engine?.getCurrentIndex() ?? -1
      switch (e.code) {
        case 'KeyK': engine?.togglePlay(); break
        case 'KeyN':
          if (queueLen > 1 && currentIdx < queueLen - 1) engine?.next()
          else toast.info(queueLen <= 1 ? 'Add more tracks to the queue' : 'Already on the last track')
          break
        case 'KeyP':
          if (queueLen > 1 && currentIdx > 0) engine?.prev()
          else toast.info(queueLen <= 1 ? 'Add more tracks to the queue' : 'Already on the first track')
          break
        case 'KeyR': engine?.toggleRepeat(); break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [engine])

  const isLive = state === 'live'
  const queueLen = engine?.getQueue().length ?? 0

  return (
    <div className="bg-white/[0.015] border-l border-border-subtle p-5 flex flex-col gap-4 overflow-y-auto h-full">
      {/* Stream info */}
      <div>
        <div className="text-[13px] tracking-[2px] uppercase text-text-ghost mb-2">Stream info</div>
        <div className="flex flex-col">
          <div className="flex justify-between py-2 border-b border-white/[0.03]">
            <span className="text-sm text-text-ghost">Status</span>
            <span className={`text-sm ${isLive ? 'text-emerald-live' : 'text-text-muted'}`}>
              {isLive ? 'On air' : 'Offline'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-white/[0.03]">
            <span className="text-sm text-text-ghost">Duration</span>
            <span className="text-sm text-text-muted tabular-nums">{formatDuration(elapsed)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-white/[0.03]">
            <span className="text-sm text-text-ghost">Format</span>
            <span className="text-sm text-text-muted">MP3 320kbps</span>
          </div>
          <div className="flex justify-between py-2 border-b border-white/[0.03]">
            <span className="text-sm text-text-ghost">Queue</span>
            <span className="text-sm text-text-muted">{queueLen} track{queueLen !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Stream URL */}
      {streamUrl && (
        <div>
          <div className="text-[11px] tracking-[2px] uppercase text-text-ghost mb-2">Stream URL</div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0 bg-surface-card border border-border-subtle rounded-md px-2.5 py-2 text-sm text-text-muted truncate select-all">
              {streamUrl}
            </div>
            <button
              onClick={copyStreamUrl}
              className="shrink-0 px-2.5 py-2 bg-violet-full/10 text-violet-muted border border-violet-full/15 rounded-md text-sm cursor-pointer hover:bg-violet-full/20 transition-all"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div>
        <div className="text-sm tracking-[2px] uppercase text-text-ghost mb-3">Keyboard shortcuts</div>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex justify-between text-sm">
              <span className="text-text-ghost">{s.action}</span>
              <span className="text-text-dim px-1.5 py-0.5 bg-white/[0.03] rounded text-[11px]">{s.key}</span>
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
        className="flex items-center justify-center gap-1.5 py-2.5 bg-red-500/[0.08] border border-red-500/15 rounded-lg text-red-500/50 text-base font-bold cursor-pointer hover:bg-red-500/15 hover:text-red-500/70 transition-all mt-auto"
      >
        <IconPlayerStopFilled/>
        End broadcast
      </button>
    </div>
  )
}
