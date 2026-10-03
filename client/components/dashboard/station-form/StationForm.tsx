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

/**
 * The station's profile: artwork, name, genre, description. One form for
 * both jobs — creating the station (on /dashboard, right on the page) and
 * editing it (in StationFormDialog) — so the two can't drift apart.
 *
 * Without `station` it creates and then opens the new station; with one it
 * saves and calls `onDone`. The link is shown, never edited: the API ignores
 * a slug on update, so it never changes.
 *
 * `actions` wraps the submit button, so the dialog can put it in its footer.
 */
export function StationForm({
  station,
  onDone,
  actions = (button) => <div>{button}</div>,
  className,
}: {
  station?: Station
  onDone?: () => void
  actions?: (submit: React.ReactNode) => React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const editing = !!station

  const [name, setName] = useState(station?.name ?? "")
  const [genre, setGenre] = useState(station?.genre ?? "")
  const [description, setDescription] = useState(station?.description ?? "")
  const [artworkUrl, setArtworkUrl] = useState(station?.artwork_url ?? "")
  const [preview, setPreview] = useState(station?.artwork_url ?? "")
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
      if (editing) {
        await api.put(`/stations/${station.slug}`, payload)
        toast.success("Station updated")
        onDone?.()
        router.refresh()
      } else {
        const res = await api.post("/stations", payload)
        const created: Station | undefined = res.data?.data
        toast.success("Station created — ready to go live?")
        onDone?.()
        if (created?.slug) router.push(`/dashboard/stations/${created.slug}`)
        else router.refresh()
      }
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 403) {
        // An account has one station (lib/station-server.ts); a second
        // wouldn't even show up in the dashboard. Not something a plan sells.
        toast.error("Each account has one station, and yours already exists.")
      } else if (err instanceof AxiosError && err.response?.data?.errors) {
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
        autoFocus={!editing}
      />
      <TextField
        label="Genre"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        placeholder="Jazz, lo-fi, talk"
        maxLength={255}
        error={errors.genre?.[0]}
        hint={editing ? undefined : "Optional, like everything below the name."}
      />
      <TextAreaField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Two lines telling listeners what you play."
        error={errors.description?.[0]}
      />
      {editing && (
        <span className="font-mono text-caption text-text-faint">
          {host}/station/{station.slug} · the link never changes
        </span>
      )}
      {actions(
        <Button size="lg" type="submit" disabled={saving || uploading || name.trim() === ""}>
          {saving ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create station"}
        </Button>,
      )}
    </form>
  )
}
