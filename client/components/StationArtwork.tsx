"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import { IconMusic } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

// The dashboard sets --artwork-placeholder to the design system's stripes.
const DEFAULT_GRADIENT = "var(--artwork-placeholder, linear-gradient(135deg, #1a0533, #2d1b69))"

interface StationArtworkProps {
  src: string | null | undefined
  alt: string
  /** Tile sizing/shape — required (e.g. `"size-12 rounded-xl"`). */
  className?: string
  iconSize?: number
  background?: string
  /** Use for above-the-fold LCP artwork (player vinyl). */
  priority?: boolean
  /** `next/image` `sizes` hint — defaults to a small-tile size for grids. */
  sizes?: string
}

/**
 * Station artwork tile. Uses `next/image` with `fill` so we get the optimizer
 * (AVIF/WebP, srcset, lazy-load) while keeping the parent's CSS sizing.
 *
 * The container's gradient acts as the skeleton — no flash of empty space
 * while the bytes load. Image fades in on decode. Falls back to an
 * `IconMusic` glyph when there's no URL.
 */
export function StationArtwork({
  src,
  alt,
  className,
  iconSize = 20,
  background = DEFAULT_GRADIENT,
  priority = false,
  sizes = "96px",
}: StationArtworkProps) {
  const [loaded, setLoaded] = useState(false)

  // A cached image can finish loading before React hydrates, and a `load`
  // event that fired before the listener was attached never fires again —
  // the artwork then sat at opacity 0 forever, an empty gradient where the
  // station's picture should be. Checking the element once it mounts catches
  // that case; `naturalWidth > 0` excludes a broken image, which also reports
  // `complete`. `onLoad` below still drives the fade for uncached loads.
  const checkCached = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])

  if (!src) {
    return (
      <div
        className={cn("flex items-center justify-center overflow-hidden text-violet-300/70 ds:text-text-faint", className)}
        style={{ background }}
      >
        <IconMusic size={iconSize} strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden text-violet-300/70 ds:text-text-faint", className)}
      style={{ background }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        ref={checkCached}
        className={cn("object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
