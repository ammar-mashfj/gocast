import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import type { Station, StreamSession } from '../types/station'
import { useBroadcast } from '../contexts/BroadcastContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatAirtime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

function formatSessionDuration(start: string, end: string): string {
  const seconds = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { state: broadcastState } = useBroadcast()
  const [station, setStation] = useState<Station | null>(null)
  const [loading, setLoading] = useState(true)

  const [deleting, setDeleting] = useState(false)
  const [showMicModal, setShowMicModal] = useState(false)
  const [sessions, setSessions] = useState<StreamSession[]>([])
  const [copiedField, setCopiedField] = useState<string | null>(null)

  async function handleGoLive() {
    if (broadcastState === 'live') {
      navigate(`/dashboard/stations/${station!.id}/studio`)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      navigate(`/dashboard/stations/${station!.id}/live`)
    } catch {
      setShowMicModal(true)
    }
  }

  useEffect(() => {
    Promise.all([
      api.get(`/stations/${id}`),
      api.get(`/stations/${id}/sessions`),
    ])
      .then(([stationRes, sessionsRes]) => {
        const s = stationRes.data.data as Station
        setStation(s)
        setSessions(sessionsRes.data.data as StreamSession[])
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  async function handleDelete() {
    if (!station || !confirm('Permanently delete this station and all its data?')) return
    setDeleting(true)
    try {
      await api.delete(`/stations/${station.id}`)
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof AxiosError) {
        alert(err.response?.data?.message || 'Failed to delete station')
      }
      setDeleting(false)
    }
  }

  if (loading || !station) return null

  return (
    <div className="w-full self-start px-10 py-8 text-left">
        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-xs text-text-ghost bg-transparent border-none cursor-pointer hover:text-text-secondary transition-colors mb-6 w-fit"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to stations
        </button>

        {/* Top header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex gap-4.5 items-center">
            <div className="w-[72px] h-[72px] rounded-[14px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center text-[30px] shrink-0">
              ♫
            </div>
            <div>
              <h1 className="text-2xl font-medium text-text-secondary mb-1">{station.name}</h1>
              <div className="text-[13px] text-text-ghost flex items-center gap-2">
                {new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href}
                <button
                  onClick={() => navigator.clipboard.writeText(new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href)}
                  className="px-2 py-0.5 bg-violet-full/10 text-violet-muted rounded text-[11px] border-none cursor-pointer hover:bg-violet-full/20 transition-all"
                >
                  Copy
                </button>
              </div>
              <div className="flex gap-3 mt-2">
                {station.genre && (
                  <span className="px-2.5 py-1 bg-white/[0.04] rounded text-[11px] text-text-muted">
                    {station.genre}
                  </span>
                )}
                <span className="px-2.5 py-1 bg-white/[0.04] rounded text-[11px] text-text-muted">
                  Created {formatDate(station.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2.5">
            <a
              href={`/station/${station.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4.5 py-3 bg-white/[0.04] text-text-muted border border-border-faint rounded-lg text-[13px] no-underline hover:bg-white/[0.07] hover:text-white/60 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Player page
            </a>
            <button
              onClick={handleGoLive}
              className={`flex items-center gap-2 px-6 py-3 border-none rounded-lg text-sm font-medium cursor-pointer hover:-translate-y-px transition-all ${
                broadcastState === 'live'
                  ? 'bg-emerald-live/90 text-white hover:bg-emerald-live'
                  : 'bg-violet text-white hover:bg-violet-full'
              }`}
            >
              {broadcastState === 'live' ? (
                <>
                  <div className="w-2 h-2 bg-white rounded-full animate-live-dot" />
                  Go to studio
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  </svg>
                  Go live
                </>
              )}
            </button>
          </div>
        </div>

        {/* Grid: stats + settings */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Stats card */}
          <div className="bg-white/[0.025] border border-border-subtle rounded-xl p-5">
            <div className="text-[11px] tracking-[2px] uppercase text-text-ghost mb-4">
              Station stats
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-2xl font-medium text-text-secondary mb-0.5">{station.stats?.sessions ?? 0}</div>
                <div className="text-[11px] text-text-ghost tracking-wide">Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-medium text-text-secondary mb-0.5">{formatAirtime(station.stats?.total_airtime_seconds ?? 0)}</div>
                <div className="text-[11px] text-text-ghost tracking-wide">Total airtime</div>
              </div>
              <div>
                <div className="text-2xl font-medium text-text-secondary mb-0.5">{station.stats?.peak_listeners ?? 0}</div>
                <div className="text-[11px] text-text-ghost tracking-wide">Peak listeners</div>
              </div>
            </div>
          </div>

          {/* Stream & share card */}
          <div className="bg-white/[0.025] border border-border-subtle rounded-xl p-5">
            <div className="text-[11px] tracking-[2px] uppercase text-text-ghost mb-4">
              Stream & share
            </div>
            <div className="flex flex-col gap-3">
              {/* Direct stream URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-text-faint tracking-wide flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-dim">
                    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
                    <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
                  </svg>
                  Direct stream URL
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 bg-surface-card border border-border-faint rounded-lg px-3 py-2 text-[12px] text-text-muted truncate select-all font-mono">
                    {`${import.meta.env.VITE_ICECAST_URL}${station.icecast_mount}`}
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${import.meta.env.VITE_ICECAST_URL}${station.icecast_mount}`, 'stream')}
                    className="shrink-0 px-2.5 py-2 bg-violet-full/10 text-violet-muted border border-violet-full/15 rounded-lg text-[11px] cursor-pointer hover:bg-violet-full/20 transition-all"
                  >
                    {copiedField === 'stream' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Player page URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-text-faint tracking-wide flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-dim">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Player page
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 bg-surface-card border border-border-faint rounded-lg px-3 py-2 text-[12px] text-text-muted truncate select-all font-mono">
                    {new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href}
                  </div>
                  <button
                    onClick={() => copyToClipboard(new URL(`/station/${station.slug}`, import.meta.env.VITE_APP_URL).href, 'player')}
                    className="shrink-0 px-2.5 py-2 bg-violet-full/10 text-violet-muted border border-violet-full/15 rounded-lg text-[11px] cursor-pointer hover:bg-violet-full/20 transition-all"
                  >
                    {copiedField === 'player' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Stream details row */}
              <div className="flex gap-4 pt-1.5 mt-0.5 border-t border-white/[0.04]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-dim tracking-wide uppercase">Format</span>
                  <span className="text-[12px] text-text-muted">MP3 128kbps</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-dim tracking-wide uppercase">Mount</span>
                  <span className="text-[12px] text-text-muted font-mono">{station.icecast_mount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent broadcasts */}
        <div className="bg-white/[0.025] border border-border-subtle rounded-xl p-5 mb-6">
          <div className="text-[11px] tracking-[2px] uppercase text-text-ghost mb-4">
            Recent broadcasts
          </div>

          {/* Header */}
          <div className="grid grid-cols-[140px_1fr_80px] px-3 py-2 text-[11px] text-text-dim tracking-wide uppercase">
            <span>Date</span>
            <span>Duration</span>
            <span className="text-right">Peak</span>
          </div>

          {sessions.filter((s) => s.ended_at).length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-text-ghost">
              No broadcasts yet. Go live to see your session history here.
            </div>
          ) : (
            <div className="flex flex-col">
              {sessions
                .filter((s) => s.ended_at)
                .map((s) => (
                  <div
                    key={s.id}
                    className="grid grid-cols-[140px_1fr_80px] px-3 py-2.5 border-t border-white/[0.03] text-[13px]"
                  >
                    <span className="text-text-muted">{formatDate(s.started_at)}</span>
                    <span className="text-text-ghost">{formatSessionDuration(s.started_at, s.ended_at!)}</span>
                    <span className="text-right text-text-ghost">{s.peak_listeners}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="border border-red-500/15 rounded-[10px] p-4 flex justify-between items-center">
          <div className="text-[13px] text-text-muted">
            <strong className="text-red-500/60 font-medium">Danger zone</strong> — permanently delete this station and all its data
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-500/10 text-red-500/60 border border-red-500/20 rounded-md text-xs cursor-pointer hover:bg-red-500/20 transition-all disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete station'}
          </button>
        </div>

        <Dialog open={showMicModal} onOpenChange={(isOpen) => { if (!isOpen) setShowMicModal(false) }}>
          <DialogContent className="bg-[#111118] border-white/[0.08] sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-white">Microphone unavailable</DialogTitle>
              <DialogDescription className="text-[13px] text-text-muted">
                Your microphone is either not connected or access was denied.
              </DialogDescription>
            </DialogHeader>

            <p className="text-[13px] text-text-muted leading-relaxed">
              You will only be able to stream files. The microphone push-to-talk feature will be disabled for this session.
            </p>

            <DialogFooter className="border-t border-white/[0.06] pt-5">
              <Button
                variant="outline"
                onClick={() => setShowMicModal(false)}
                className="border-border-faint text-text-muted bg-transparent hover:bg-white/[0.04] hover:text-white/60"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowMicModal(false)
                  navigate(`/dashboard/stations/${station.id}/live`, { state: { micDisabled: true } })
                }}
                className="bg-violet text-white hover:bg-violet-full"
              >
                I understand
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
