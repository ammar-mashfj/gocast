"use client"

import { useState, useRef, type FormEvent, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { IconUpload, IconX } from "@tabler/icons-react"
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
  const [slug, setSlug] = useState(station?.slug ?? "")
  const [description, setDescription] = useState(station?.description ?? "")
  const [genre, setGenre] = useState(station?.genre ?? "")
  const [artworkUrl, setArtworkUrl] = useState(station?.artwork_url ?? "")
  const [artworkPreview, setArtworkPreview] = useState(station?.artwork_url ?? "")
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  function generateSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!isEdit) {
      setSlug(generateSlug(value))
    }
  }

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

    const payload = {
      name,
      slug,
      description: description || null,
      genre: genre || null,
      artwork_url: artworkUrl || null,
    }

    try {
      if (isEdit) {
        await api.put(`/stations/${station.slug}`, payload)
        toast.success("Station updated")
      } else {
        await api.post("/stations", payload)
        toast.success("Station created")
      }
      onClose()
      router.refresh()
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
                  className="size-16 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border hover:border-primary/50 transition-colors cursor-pointer"
                >
                  {artworkPreview ? (
                    <img src={artworkPreview} alt="Artwork" className="size-full object-cover" />
                  ) : (
                    <IconUpload size={20} className="text-muted-foreground" />
                  )}
                </button>
                <div className="flex flex-col gap-1">
                  {artworkPreview ? (
                    <Button type="button" variant="ghost" size="sm" onClick={removeArtwork}>
                      <IconX size={14} />
                      Remove
                    </Button>
                  ) : (
                    <FieldDescription>
                      Square image, max 2 MB. Shown on your player page.
                    </FieldDescription>
                  )}
                  {uploading && (
                    <span className="text-xs text-muted-foreground">Uploading...</span>
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
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Radio Station"
                required
                maxLength={100}
                aria-invalid={!!errors.name}
              />
              {errors.name && <FieldError>{errors.name[0]}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="slug">URL slug</FieldLabel>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-radio-station"
                required
                maxLength={60}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                aria-invalid={!!errors.slug}
              />
              <FieldDescription>gocast.fm/station/{slug || "your-slug"}</FieldDescription>
              {errors.slug && <FieldError>{errors.slug[0]}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="genre">Genre</FieldLabel>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Jazz, Lo-Fi, Talk..."
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
              {loading ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save changes" : "Create station")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
