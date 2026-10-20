"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import { env } from "@/lib/env"
import type { Station } from "@/interfaces/Station"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { TextAreaField, TextField } from "@/components/ds/Field"
import { ArtworkDrop } from "./ArtworkDrop"
import { DESCRIPTION_MAX } from "./CreateStation"

/**
 * The station's profile: artwork, name, genre, description, edited in
 * StationFormDialog. Saves and calls `onDone`. The link is shown, never
 * edited: the API ignores a slug on update, so it never changes.
 *
 * Making the station is CreateStation, a page of its own: it has the link
 * (choosable only then) and the listener preview, which have no place in an
 * edit dialog.
 *
 * `actions` wraps the submit button, so the dialog can put it in its footer.
 */
export function StationForm({
  station,
  onDone,
  actions = (button) => <div>{button}</div>,
  className,
}: {
  station: Station
  onDone?: () => void
  actions?: (submit: React.ReactNode) => React.ReactNode
  className?: string
}) {
  const router = useRouter()

  const [name, setName] = useState(station.name)
  const [genre, setGenre] = useState(station.genre ?? "")
  const [description, setDescription] = useState(station.description ?? "")
  const [artworkUrl, setArtworkUrl] = useState(station.artwork_url ?? "")
  const [preview, setPreview] = useState(station.artwork_url ?? "")
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  // A local preview is an object URL; let it go when it's replaced.
  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview)
  }, [preview])

  async function upload(file: File) {
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await api.post("/upload/images", body, { headers: { "Content-Type": "multipart/form-data" } })
      setArtworkUrl(res.data.data.url)
    } catch {
      toast.error("Couldn’t upload that artwork. Try another image.")
      setPreview(artworkUrl)
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const payload = {
      name: name.trim(),
      genre: genre.trim() || null,
      description: description.trim() || null,
      artwork_url: artworkUrl || null,
    }
    try {
      await api.put(`/stations/${station.slug}`, payload)
      toast.success("Station updated")
      onDone?.()
      router.refresh()
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.errors) {
        setErrors(err.response.data.errors)
      } else {
        toast.error((err instanceof AxiosError && err.response?.data?.message) || "Something went wrong. Nothing was saved.")
      }
    } finally {
      setSaving(false)
    }
  }

  const host = env.appUrl.replace(/^https?:\/\//, "")

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-3.5", className)}>
      <ArtworkDrop
        preview={preview || null}
        uploading={uploading}
        onFile={upload}
        onRemove={() => {
          setArtworkUrl("")
          setPreview("")
        }}
        onReject={(message) => toast.error(message)}
      />
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Night Shift Radio"
        required
        maxLength={100}
        error={errors.name?.[0]}
      />
      <TextField
        label="Genre"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        placeholder="Jazz, lo-fi, talk"
        maxLength={255}
        error={errors.genre?.[0]}
      />
      <TextAreaField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Two lines telling listeners what you play."
        // maxLength without the create form's slice: an older description
        // past the limit can still be trimmed down here, not cut on the first
        // keystroke. The counter shows how far over it is.
        maxLength={DESCRIPTION_MAX}
        error={errors.description?.[0]}
        trailing={
          <span className="font-mono text-micro text-text-faint" aria-live="polite">
            {description.length}/{DESCRIPTION_MAX}
          </span>
        }
      />
      <span className="font-mono text-caption text-text-faint">
        {host}/station/{station.slug} · the link never changes
      </span>
      {actions(
        <Button size="lg" type="submit" disabled={saving || uploading || name.trim() === ""}>
          {saving ? "Saving…" : "Save changes"}
        </Button>,
      )}
    </form>
  )
}
