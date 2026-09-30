"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { env } from "@/lib/env"

interface Handlers {
  onStop: () => void
  onBuffering: (buffering: boolean) => void
}

/**
 * The element, built on first use and kept outside React so a re-render
 * never restarts the audio. Plain functions rather than hook-body code: the
 * compiler's immutability rule treats assignments to a ref's value inside a
 * callback as a mutation, and it is right to — this is exactly the kind of
 * side effect that belongs behind a boundary it does not look into.
 */
function createElement({ onStop, onBuffering }: Handlers): HTMLAudioElement {
  const audio = new Audio()
  audio.preload = "none"
  audio.addEventListener("ended", onStop)
  audio.addEventListener("playing", () => onBuffering(false))
  audio.addEventListener("waiting", () => onBuffering(true))
  audio.addEventListener("error", () => {
    toast.error("Couldn't play that file.")
    onStop()
  })
  return audio
}

function start(audio: HTMLAudioElement, url: string): Promise<void> {
  audio.src = url
  return audio.play()
}

function silence(audio: HTMLAudioElement): void {
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
}

/**
 * One preview at a time for a list of tracks.
 *
 * It points straight at the owner-only audio route: the auth cookie is
 * site-scoped and a media element sends it on a same-site request, so no
 * token has to be threaded into the URL.
 *
 * Whatever is playing stops when the list unmounts — switching from the
 * library to a playlist must not leave a track playing from a screen that is
 * no longer there.
 */
export function useTrackPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)

  const stop = useCallback(() => {
    if (audioRef.current) silence(audioRef.current)
    setPreviewingId(null)
    setBuffering(false)
  }, [])

  const toggle = useCallback(
    (id: string) => {
      if (previewingId === id) {
        stop()
        return
      }

      audioRef.current ??= createElement({ onStop: stop, onBuffering: setBuffering })

      setPreviewingId(id)
      setBuffering(true)
      // A rejected play() is an autoplay refusal or a decode failure. The
      // error listener already reports the latter, and the former cannot
      // happen on a click, so this only has to leave the UI consistent.
      start(audioRef.current, `${env.apiUrl}/tracks/${id}/audio`).catch(stop)
    },
    [previewingId, stop],
  )

  useEffect(() => stop, [stop])

  return { previewingId, buffering, toggle, stop }
}
