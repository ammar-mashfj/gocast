"use client"

import { useState } from "react"
import Image from "next/image"
import { IconMusic } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

const DEFAULT_GRADIENT = "linear-gradient(135deg, #1a0533, #2d1b69)"

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

  if (!src) {
    return (
      <div
        className={cn("flex items-center justify-center overflow-hidden text-violet-300/70", className)}
        style={{ background }}
      >
        <IconMusic size={iconSize} strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden text-violet-300/70", className)}
      style={{ background }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
