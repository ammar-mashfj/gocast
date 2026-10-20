"use client"

import { useRef, useState } from "react"
import { IconLoader2, IconPhoto } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"

/** Mirrors UploadRequest's `images` rule (minus GIF, which nobody wants as artwork). */
export const ARTWORK_TYPES = ["image/png", "image/jpeg", "image/webp"]
export const ARTWORK_MAX_BYTES = 5 * 1024 * 1024

/** Why a file can't be artwork, or null when it can. Said before uploading. */
export function artworkProblem(file: File): string | null {
  if (!ARTWORK_TYPES.includes(file.type)) return "Artwork has to be a PNG, JPEG or WebP image."
  if (file.size > ARTWORK_MAX_BYTES) return "Artwork can be up to 5 MB."
  return null
}

/**
 * The prototype's dashed artwork box: drop an image on it or click it to
 * pick one. With artwork it shows the preview and Remove. The parent owns
 * the upload; this only hands over a file that passed `artworkProblem`.
 */
export function ArtworkDrop({
  preview,
  uploading,
  onFile,
  onRemove,
  onReject,
}: {
  preview: string | null
  uploading: boolean
  onFile: (file: File) => void
  onRemove: () => void
  onReject: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function take(file: File | undefined) {
    if (!file) return
    const problem = artworkProblem(file)
    if (problem) onReject(problem)
    else onFile(file)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!uploading) take(e.dataTransfer.files[0])
      }}
      className={cn(
        "flex items-center gap-3.5 rounded-panel border-stroke border-dashed bg-surface-inset p-3.5 transition-colors",
        over ? "border-foreground/50" : "border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading}
        aria-label={preview ? "Change artwork" : "Choose artwork"}
        className="relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-item bg-surface-control text-text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL or the uploaded image
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <IconPhoto aria-hidden className="size-5" />
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/80">
            <IconLoader2 aria-label="Uploading" className="size-5 animate-spin text-foreground" />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <span className="text-sm font-semibold">{preview ? "Your artwork" : "Drop artwork here"}</span>
        <span className="text-caption text-text-faint">Square, up to 5 MB. Shown on your player page.</span>
      </div>

      {preview ? (
        <Button type="button" size="sm" variant="quiet" onClick={onRemove} disabled={uploading}>
          Remove
        </Button>
      ) : (
        // The tile picks a file too, so on a phone the words get the room.
        <Button type="button" size="sm" variant="subtle" className="hidden sm:inline-flex" onClick={() => input.current?.click()} disabled={uploading}>
          Choose
        </Button>
      )}

      <input
        ref={input}
        type="file"
        accept={ARTWORK_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          take(e.target.files?.[0])
          e.target.value = ""
        }}
      />
    </div>
  )
}
