import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import type { Station } from '../types/station'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [station, setStation] = useState<Station | null>(null)
  const [loading, setLoading] = useState(true)

  // Quick settings form
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get(`/stations/${id}`)
      .then((res) => {
        const s = res.data.data as Station
        setStation(s)
        setEditName(s.name)
        setEditDescription(s.description || '')
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  async function handleSave() {
    if (!station || !editName) return
    setSaving(true)
    try {
      const { data } = await api.put(`/stations/${station.id}`, {
        name: editName,
        description: editDescription || undefined,
      })
      setStation(data.data)
    } finally {
      setSaving(false)
    }
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
                gocast.fm/{station.slug}
                <button
                  onClick={() => navigator.clipboard.writeText(`gocast.fm/${station.slug}`)}
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
              onClick={() => navigate(`/dashboard/stations/${station.id}/live`)}
              className="flex items-center gap-2 px-6 py-3 bg-violet text-white border-none rounded-lg text-sm font-medium cursor-pointer hover:bg-violet-full hover:-translate-y-px transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
              </svg>
              Go live
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
                <div className="text-2xl font-medium text-text-secondary mb-0.5">0</div>
                <div className="text-[11px] text-text-ghost tracking-wide">Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-medium text-text-secondary mb-0.5">0h</div>
                <div className="text-[11px] text-text-ghost tracking-wide">Total airtime</div>
              </div>
              <div>
                <div className="text-2xl font-medium text-text-secondary mb-0.5">0</div>
                <div className="text-[11px] text-text-ghost tracking-wide">Peak listeners</div>
              </div>
            </div>
          </div>

          {/* Quick settings card */}
          <div className="bg-white/[0.025] border border-border-subtle rounded-xl p-5">
            <div className="text-[11px] tracking-[2px] uppercase text-text-ghost mb-4">
              Quick settings
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-faint">Station name</label>
                <input
                  className="bg-surface-card border border-border-faint rounded-lg px-3 py-2.5 text-[13px] text-text-secondary font-[inherit] outline-none focus:border-violet-muted/40 transition-colors w-full"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-faint">Description</label>
                <input
                  className="bg-surface-card border border-border-faint rounded-lg px-3 py-2.5 text-[13px] text-text-secondary font-[inherit] outline-none focus:border-violet-muted/40 transition-colors w-full"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-fit px-5 py-2.5 bg-violet-subtle text-violet border border-violet-border rounded-lg text-[13px] cursor-pointer hover:bg-violet/25 hover:text-white transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Recent broadcasts */}
        <div className="bg-white/[0.025] border border-border-subtle rounded-xl p-5 mb-6">
          <div className="text-[11px] tracking-[2px] uppercase text-text-ghost mb-4">
            Recent broadcasts
          </div>

          {/* Header */}
          <div className="grid grid-cols-[140px_1fr_80px_80px_40px] px-3 py-2 text-[11px] text-text-dim tracking-wide uppercase">
            <span>Date</span>
            <span>Duration</span>
            <span className="text-right">Peak</span>
            <span className="text-right">Minutes</span>
            <span />
          </div>

          {/* Empty state for now */}
          <div className="px-3 py-6 text-center text-[13px] text-text-ghost">
            No broadcasts yet. Go live to see your session history here.
          </div>
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
    </div>
  )
}
