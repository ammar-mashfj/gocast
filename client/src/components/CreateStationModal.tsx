import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { AxiosError } from 'axios'
import api from '../lib/axios'
import type { Station } from '../types/station'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconPlus, IconUpload } from '@tabler/icons-react'

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

const INPUT_CLASS =
  'bg-surface-card border border-border-faint rounded-lg px-3.5 py-[11px] text-sm text-text-secondary font-[inherit] outline-none transition-colors focus:border-violet-muted w-full placeholder:text-text-dim'

const SELECT_CLASS =
  "bg-surface-card border border-border-faint rounded-lg px-3.5 py-[11px] text-sm text-text-secondary font-[inherit] outline-none appearance-none cursor-pointer w-full transition-colors focus:border-violet-muted bg-no-repeat select-arrow [&>option]:bg-[#111118] [&>option]:text-text-secondary"

export default function CreateStationModal({ open, onClose, onCreated }: CreateStationModalProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [genre, setGenre] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetForm()
      onClose()
    }
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#111118] border-white/[0.08] sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-white">Create new station</DialogTitle>
          <DialogDescription className="sr-only">
            Fill in the details below to create a new radio station.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
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
                {new URL('/station/', import.meta.env.VITE_APP_URL).href}
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
                <Button variant="outline" size="sm" className="gap-2 text-[13px] text-text-muted border-border-faint bg-white/[0.04] hover:bg-white/[0.07] hover:text-white/60">
                  <IconUpload size={14} />
                  Upload image
                </Button>
                <div className="text-[11px] text-text-dim mt-1.5">
                  Square image, min 400x400px. JPG or PNG.
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-white/[0.06] pt-5">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-border-faint text-text-muted bg-transparent hover:bg-white/[0.04] hover:text-white/60"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !name || !slug}
            className="bg-violet text-white hover:bg-violet-full hover:-translate-y-px"
          >
            <IconPlus size={14} />
            {loading ? 'Creating...' : 'Create station'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
