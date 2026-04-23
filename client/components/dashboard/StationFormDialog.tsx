"use client"

import { useState, useRef, type FormEvent, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { IconUpload, IconX, IconLoader2 } from "@tabler/icons-react"
import api from "@/lib/axios"
import { Station } from "@/interfaces/Station"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field"

interface StationFormDialogProps {
  open: boolean
  onClose: () => void
  station?: Station
}

export function StationFormDialog({ open, onClose, station }: StationFormDialogProps) {
  const router = useRouter()
  const isEdit = !!station
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(station?.name ?? "")
  const [description, setDescription] = useState(station?.description ?? "")
  const [genre, setGenre] = useState(station?.genre ?? "")
  const [artworkUrl, setArtworkUrl] = useState(station?.artwork_url ?? "")
  const [artworkPreview, setArtworkPreview] = useState(station?.artwork_url ?? "")
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  async function handleArtworkChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setArtworkPreview(URL.createObjectURL(file))
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await api.post("/upload/images", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setArtworkUrl(res.data.data.url)
    } catch {
      toast.error("Failed to upload artwork")
      setArtworkPreview("")
      setArtworkUrl("")
    } finally {
      setUploading(false)
    }
  }

  function removeArtwork() {
    setArtworkUrl("")
    setArtworkPreview("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    const payload: Record<string, string | null> = {
      name,
      description: description || null,
      genre: genre || null,
      artwork_url: artworkUrl || null,
    }

    try {
      if (isEdit) {
        await api.put(`/stations/${station.slug}`, payload)
        toast.success("Station updated")
        onClose()
        router.refresh()
      } else {
        const res = await api.post("/stations", payload)
        const created: Station | undefined = res.data?.data
        toast.success("Station created — ready to go live?")
        onClose()
        if (created?.slug) {
          router.push(`/dashboard/stations/${created.slug}`)
        } else {
          router.refresh()
        }
      }
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 403) {
        toast.error("You've reached your station limit. Upgrade to Pro for more stations.")
      } else if (err instanceof AxiosError && err.response?.data?.errors) {
        setErrors(err.response.data.errors)
      } else if (err instanceof AxiosError) {
        toast.error(err.response?.data?.message || "Something went wrong")
      } else {
        toast.error("Something went wrong")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit station" : "Create station"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update your station details." : "Set up your new station."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {/* Artwork upload */}
            <Field>
              <FieldLabel>Artwork</FieldLabel>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="relative size-16 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border hover:border-primary/50 transition-colors cursor-pointer disabled:cursor-wait"
                >
                  {artworkPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- preview is a local data URL
                    <img src={artworkPreview} alt="Artwork" className="size-full object-cover" />
                  ) : (
                    <IconUpload size={18} className="text-muted-foreground" />
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
                      <IconLoader2 size={18} className="animate-spin text-primary" />
                    </div>
                  )}
                </button>
                <div className="flex flex-col gap-1">
                  {artworkPreview ? (
                    <Button type="button" variant="ghost" size="sm" onClick={removeArtwork} disabled={uploading}>
                      <IconX size={14} />
                      Remove
                    </Button>
                  ) : (
                    <FieldDescription>
                      Square image, max 2 MB. Shown on your player page.
                    </FieldDescription>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleArtworkChange}
                />
              </div>
            </Field>

            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Radio Station"
                required
                maxLength={100}
                aria-invalid={!!errors.name}
              />
              {errors.name && <FieldError>{errors.name[0]}</FieldError>}
            </Field>

            {isEdit && station && (
              <Field>
                <FieldLabel>Station URL</FieldLabel>
                <FieldDescription>gocast.fm/station/{station.slug}</FieldDescription>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="genre">Genre</FieldLabel>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Jazz, lo-fi, talk"
                maxLength={255}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's your station about?"
                rows={3}
              />
            </Field>

          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading}>
              {loading ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save changes" : "Create station")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
