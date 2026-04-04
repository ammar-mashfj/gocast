import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import type { Station } from '../types/station'
import Modal from './Modal'

interface CreateStationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (station: Station) => void
}

const GENRES = [
  'Ambient', 'Classical', 'Country', 'Electronic', 'Hip Hop', 'Jazz',
  'Lo-Fi', 'Pop', 'R&B / Soul', 'Rock', 'Talk / Podcast', 'World', 'Other',
] as const

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

const INPUT_CLASS =
  'bg-surface-card border border-border-faint rounded-lg px-3.5 py-[11px] text-sm text-text-secondary font-[inherit] outline-none transition-colors focus:border-violet-muted w-full placeholder:text-text-dim'

const SELECT_CLASS =
  "bg-surface-card border border-border-faint rounded-lg px-3.5 py-[11px] text-sm text-text-secondary font-[inherit] outline-none appearance-none cursor-pointer w-full transition-colors focus:border-violet-muted bg-no-repeat bg-[url(\"data:image/svg+xml,%3Csvg%20width='12'%20height='12'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='rgba(255,255,255,0.2)'%20stroke-width='2'%20xmlns='http://www.w3.org/2000/svg'%3E%3Cpath%20d='M6%209l6%206%206-6'/%3E%3C/svg%3E\")] bg-[position:right_12px_center] [&>option]:bg-[#111118] [&>option]:text-text-secondary"

export default function CreateStationModal({ open, onClose, onCreated }: CreateStationModalProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [genre, setGenre] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-generate slug from name
  useEffect(() => {
    setSlug(slugify(name))
  }, [name])

  const resetForm = useCallback(() => {
    setName('')
    setSlug('')
    setGenre('')
    setDescription('')
    setError('')
  }, [])

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleCreate() {
    if (!name || !slug) return

    setError('')
    setLoading(true)
    try {
      const payload: Record<string, string> = { name, slug }
      if (genre) payload.genre = genre
      if (description) payload.description = description

      const { data } = await api.post('/stations', payload)
      resetForm()
      onCreated(data.data)
    } catch (err) {
      if (err instanceof AxiosError) {
        const errData = err.response?.data
        const fieldError = errData?.errors
          ? Object.values(errData.errors as Record<string, string[]>).flat()[0]
          : null
        setError(fieldError || errData?.message || 'Failed to create station')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const footer = (
    <>
      <button
        onClick={handleClose}
        className="px-5 py-2.5 bg-transparent border border-border-faint rounded-lg text-[13px] text-text-muted font-[inherit] cursor-pointer hover:bg-white/[0.04] hover:text-white/60 transition-all"
      >
        Cancel
      </button>
      <button
        onClick={handleCreate}
        disabled={loading || !name || !slug}
        className="px-6 py-2.5 bg-violet border-none rounded-lg text-[13px] font-medium text-white font-[inherit] cursor-pointer flex items-center gap-1.5 hover:bg-violet-full hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      >
        <PlusIcon />
        {loading ? 'Creating...' : 'Create station'}
      </button>
    </>
  )

  return (
    <Modal title="Create new station" open={open} onClose={handleClose} footer={footer}>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Station name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-muted tracking-wide">Station name</label>
        <input
          className={INPUT_CLASS}
          type="text"
          placeholder="e.g. Jazz Lounge, Morning Beats"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Station URL */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-muted tracking-wide">Station URL</label>
        <div className="flex items-center bg-surface-card border border-border-faint rounded-lg overflow-hidden transition-colors focus-within:border-violet-muted">
          <span className="pl-3.5 py-[11px] text-sm text-text-ghost whitespace-nowrap select-none">
            gocast.fm/
          </span>
          <input
            className="bg-transparent border-none pr-3.5 py-[11px] text-sm text-text-secondary font-[inherit] outline-none flex-1 w-full placeholder:text-text-dim"
            type="text"
            placeholder="your-station"
            value={slug}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSlug(slugify(e.target.value))}
          />
        </div>
      </div>

      {/* Genre */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-muted tracking-wide">Genre</label>
        <select
          className={SELECT_CLASS}
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          <option value="">Select genre...</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-muted tracking-wide">Description</label>
        <textarea
          className={`${INPUT_CLASS} resize-y min-h-[70px]`}
          placeholder="Tell listeners what your station is about..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Station artwork */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-muted tracking-wide">Station artwork</label>
        <div className="flex items-center gap-4">
          <div className="w-[72px] h-[72px] rounded-xl bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center text-[28px] shrink-0 border border-border-subtle">
            ♫
          </div>
          <div>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] border border-border-faint rounded-lg text-[13px] text-text-muted cursor-pointer hover:bg-white/[0.07] hover:text-white/60 transition-all">
              <UploadIcon />
              Upload image
            </button>
            <div className="text-[11px] text-text-dim mt-1.5">
              Square image, min 400x400px. JPG or PNG.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
