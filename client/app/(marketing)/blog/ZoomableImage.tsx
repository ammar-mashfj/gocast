"use client"

import { useState } from "react"
import Image from "next/image"
import { IconZoomIn } from "@tabler/icons-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ZoomableImageProps {
  src: string
  /** Doubles as the lightbox's accessible name, so it has to read as a sentence. */
  alt: string
  width: number
  height: number
  /** Applied to the thumbnail button, not the image — that's where the width bleed lives. */
  className?: string
  /**
   * Preload the thumbnail. For the article's header image, which is the LCP
   * element; leave it off for anything below the fold. Note this replaces the
   * `priority` prop, deprecated in Next 16.
   */
  preload?: boolean
}

/**
 * An article image that opens full size when clicked, with a second click
 * inside the lightbox switching between fit-to-window and 1:1.
 *
 * Screenshots of a dashboard are unreadable at prose width, so every image in
 * a blog body — and the header image above it — should go through here rather
 * than being rendered as a bare `next/image`. Radix's Dialog is doing the
 * unglamorous half of the work: Escape to close, focus trap, restoring focus
 * to the thumbnail, and locking the page behind it from scrolling.
 */
export function ZoomableImage({
  src,
  alt,
  width,
  height,
  className,
  preload,
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false)
  const [actualSize, setActualSize] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open full size: ${alt}`}
        className={cn(
          "group relative my-8 block w-full cursor-zoom-in border-0 bg-transparent p-0",
          className
        )}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          preload={preload}
          // Spelled out rather than left to `prose-img`, because the header
          // image is rendered outside the prose block.
          className="my-0 w-full rounded-xl border border-white/[0.06]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition-opacity supports-backdrop-filter:backdrop-blur-xs group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <IconZoomIn size={14} />
          Zoom
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // Always reopen fitted, whatever the last view was.
          if (!next) setActualSize(false)
        }}
      >
        <DialogContent
          // Hug the image rather than the viewport, so a wide monitor doesn't
          // frame it in a mostly-empty box.
          style={{ maxWidth: `min(100vw - 1.5rem, ${width + 16}px)` }}
          className="block max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] overflow-auto bg-black/40 p-2 ring-white/10"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>

          <button
            type="button"
            onClick={() => setActualSize((current) => !current)}
            aria-label={actualSize ? "Fit image to window" : "View image at full size"}
            className={cn(
              "block border-0 bg-transparent p-0",
              actualSize ? "cursor-zoom-out" : "w-full cursor-zoom-in"
            )}
          >
            <Image
              src={src}
              alt=""
              width={width}
              height={height}
              // The thumbnail has usually warmed the cache, but a click while
              // it is still loading would otherwise open an empty lightbox.
              loading="eager"
              // Fitted view is capped at the image's own width: on a wide
              // monitor a full-bleed dialog would otherwise blow it up past
              // 1:1, which makes the zoom toggle look like it shrinks things.
              style={actualSize ? undefined : { maxWidth: width }}
              className={cn(
                "rounded-lg",
                actualSize
                  ? "h-auto w-auto max-w-none"
                  : "mx-auto h-auto max-h-[calc(100dvh-6rem)] w-full object-contain"
              )}
            />
          </button>
        </DialogContent>
      </Dialog>
    </>
  )
}
