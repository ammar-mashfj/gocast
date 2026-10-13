"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { IconPlayerPlayFilled } from "@tabler/icons-react"
import { toast } from "sonner"
import api from "@/lib/axios"
import { env } from "@/lib/env"
import { cn } from "@/lib/utils"
import type { Station } from "@/interfaces/Station"
import { Button } from "@/components/ds/Button"
import { TextAreaField, TextField } from "@/components/ds/Field"
import { PageHeader } from "@/components/ds/PageHeader"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Tag } from "@/components/ds/Tag"
import { ArtworkDrop } from "./ArtworkDrop"

/**
 * The first thing a new account does: make its station. One screen, from the
 * "Create station" comp in the GoCast Web design project.
 *
 * A name is all it needs. The link is built from the name, and only the
 * name — the server mints it (Station::slugFor), appending -2, -3 when the
 * name is already someone's — and the page shows what it will be as you
 * type, so the address is no surprise on the overview. It is read-only: the
 * comp's editable link was decided against (2026-10-09). Genre, description
 * and artwork are optional and editable later; the link is not.
 *
 * The right-hand card is what a listener will see on the player page, drawn
 * live from the form, so the owner sees what they are making rather than a
 * list of fields.
 *
 * Editing an existing station is StationForm, in a dialog. The two differ on
 * purpose: this one has the link preview and the listener card, that one
 * already is the profile.
 */

/** The most common genres on existing stations, as quick picks. "Something else" opens a text field. */
const GENRES = ["Talk", "Jazz", "Pop", "Rock", "Hip-hop", "Gospel", "Country", "Lo-fi", "Sports", "News"] as const

const DESCRIPTION_MAX = 160
const PREVIEW_DELAY_MS = 400

export function CreateStation() {
  const router = useRouter()
  const host = env.appUrl.replace(/^https?:\/\//, "")
  const linkPrefix = `${host}/station/`

  const [name, setName] = useState("")
  const [genre, setGenre] = useState("")
  const [customGenre, setCustomGenre] = useState(false)
  const [description, setDescription] = useState("")
  const [artworkUrl, setArtworkUrl] = useState("")
  const [preview, setPreview] = useState("")
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  // The link the server says this name gets. Null until the first answer,
  // and kept while the next one is on its way, so the box never blinks.
  const [slug, setSlug] = useState<string | null>(null)

  // A local preview is an object URL; let it go when it's replaced.
  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview)
  }, [preview])

  // Ask the server what link the name gets, a moment after typing stops. A
  // reply for a name that has since changed is dropped rather than shown.
  const latest = useRef(name)
  latest.current = name
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed === "") {
      setSlug(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/stations/slug-preview", { params: { name: trimmed } })
        if (latest.current === name) setSlug(res.data.data.slug ?? null)
      } catch {
        // Back to the placeholder: the last answer was for another name, and
        // showing it would promise a link creating won't mint. The overview
        // shows the real one after creating.
        if (latest.current === name) setSlug(null)
      }
    }, PREVIEW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [name])

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

  const trimmedName = name.trim()
  const ready = trimmedName !== ""

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    setErrors({})
    try {
      const res = await api.post("/stations", {
        name: trimmedName,
        genre: genre.trim() || null,
        description: description.trim() || null,
        artwork_url: artworkUrl || null,
      })
      const created: Station | undefined = res.data?.data
      toast.success(`${trimmedName} is ready. It’s off air for now.`)
      if (created?.slug) router.push(`/dashboard/stations/${created.slug}`)
      else router.refresh()
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

  const link = `${linkPrefix}${slug ?? "your-link"}`

  return (
    // The shell pads every page 120px at the bottom for the phone tab bar,
    // which this page has none of (no station yet), and that padding alone
    // gave it a scrollbar at 900px. Pulled back to 16px here only.
    <div className="-mb-26 flex flex-col gap-6">
      <PageHeader title="Let’s set up your station." description="A name is all it takes. Everything else can wait." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-6">
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-3.5">
          {/* Same eyebrow as the preview's, so the two columns start on one line. */}
          <span className="eyebrow -mb-1 px-1 text-text-faint">Station details</span>
          <TextField
            label="Station name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setErrors((prev) => ("name" in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== "name")) : prev))
            }}
            placeholder="e.g. Night Owl Radio"
            required
            maxLength={100}
            autoFocus
            error={errors.name?.[0]}
          />

          {/* The link, read-only: built from the name by the server, shown as it will be. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-1 rounded-button bg-surface-control px-4 py-3">
              <span className="text-caption font-semibold text-muted-foreground">Your link</span>
              <span className="truncate font-mono text-sm font-medium" aria-live="polite">
                <span className="text-text-faint">{linkPrefix}</span>
                <span className={slug ? "text-foreground" : "text-text-faint"}>{slug ?? "your-link"}</span>
              </span>
            </div>
            <p className="px-1 text-body-sm text-text-faint">Built from the name. If the name is already someone’s, a number is added.</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 px-1 text-caption font-semibold text-muted-foreground">Genre</legend>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <GenreChip
                  key={g}
                  selected={!customGenre && genre === g}
                  onClick={() => {
                    setCustomGenre(false)
                    setGenre(genre === g && !customGenre ? "" : g)
                  }}
                >
                  {g}
                </GenreChip>
              ))}
              <GenreChip
                selected={customGenre}
                onClick={() => {
                  setCustomGenre(!customGenre)
                  setGenre("")
                }}
              >
                Something else…
              </GenreChip>
            </div>
            {customGenre && (
              <TextField
                label="Your genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Balkan folk, drum and bass, radio drama"
                maxLength={255}
                autoFocus
                error={errors.genre?.[0]}
              />
            )}
          </fieldset>

          <TextAreaField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            maxLength={DESCRIPTION_MAX}
            placeholder="One line about what listeners will hear."
            error={errors.description?.[0]}
            trailing={
              <span className="font-mono text-micro text-text-faint" aria-live="polite">
                {description.length}/{DESCRIPTION_MAX}
              </span>
            }
          />

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

          <div className="flex flex-col gap-2.5 pt-1.5">
            <Button size="xl" full type="submit" disabled={!ready || saving || uploading}>
              {saving ? "Creating…" : trimmedName ? `Create ${trimmedName}` : "Create station"}
            </Button>
            <p className="px-1 text-body-sm text-text-faint">Your station starts off air. Nobody can tune in until you go live or start AutoDJ.</p>
          </div>
        </form>

        <aside className="flex min-w-0 flex-col gap-2.5 md:sticky md:top-[calc(var(--chrome-h,0px)+1.25rem)]" aria-label="What listeners see">
          <span className="eyebrow px-1 text-text-faint">What listeners see</span>
          <div className="flex flex-col gap-4.5 rounded-hero bg-card p-6">
            <div className="flex items-center gap-4">
              <div className="size-21 shrink-0 overflow-hidden rounded-panel" style={{ background: "var(--artwork-placeholder)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL or the uploaded image */}
                {preview && <img src={preview} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className={cn("font-display text-title text-balance break-words", trimmedName ? "text-foreground" : "text-text-faint")}>
                  {trimmedName || "Your station"}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {genre.trim() && <Tag>{genre.trim()}</Tag>}
                  <StatusLamp tone="off">Off air</StatusLamp>
                </div>
              </div>
            </div>
            {description.trim() && <p className="text-body text-pretty text-muted-foreground">{description.trim()}</p>}
            <div className="flex items-center gap-3 rounded-well bg-surface-inset py-2.5 pr-2.5 pl-4">
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-muted-foreground">{link}</span>
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-faint">
                <IconPlayerPlayFilled size={16} />
              </span>
            </div>
          </div>
          <p className="px-1 text-body-sm text-pretty text-text-faint">
            The name, genre, description and artwork can change any time. The link can’t, so people who saved it always find you.
          </p>
        </aside>
      </div>
    </div>
  )
}

/** One genre, as a toggle: off-white when chosen, the card colour otherwise. */
function GenreChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex h-10 cursor-pointer items-center rounded-control px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
