"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import api from "@/lib/axios"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import type { Track } from "@/interfaces/Track"
import { batchFiles, isAudioFile, uploadErrorMessage } from "./upload"

/**
 * What the meter needs to say. Everything is in *file* bytes rather than
 * request bytes: multipart framing makes a request several kilobytes larger
 * than the files it carries, and a percentage that disagrees with the sizes
 * printed next to it reads as a bug.
 */
export interface UploadProgress {
  totalFiles: number
  /** Files whose bytes have all left the browser. */
  filesSent: number
  /** Name of the file currently on the wire, or null once they all are. */
  currentFile: string | null
  totalBytes: number
  sentBytes: number
  /** Bytes are up; the server is still reading tags and committing. */
  processing: boolean
  /** Average rate so far. Null until there is enough elapsed time to mean anything. */
  bytesPerSecond: number | null
  /** Seconds left at that rate, null while the rate is unknown. */
  secondsLeft: number | null
}

interface Options {
  slug: string
  /** Omitted for the rotation; "jingle" for the dialog. The endpoint is the same. */
  kind?: "jingle"
  /** Word for the toast — "track" or "jingle". */
  noun: string
  /** Called once per committed batch, so a long drop fills the list as it goes. */
  onUploaded: (tracks: Track[]) => void
}

/**
 * The upload half of both library surfaces: gating, filtering, batching,
 * posting, progress and the toasts. Shared because a 300 MB file behaves the
 * same whether it is a jingle or a rotation track, and the two copies of this
 * loop had already started to drift — only the rotation batched.
 */
export function useTrackUpload({ slug, kind, noun, onUploaded }: Options) {
  const locked = useAutoDjLocked()
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  // A second drop while the first is in flight would interleave two progress
  // streams onto one meter, and the second would win every render race.
  const busy = useRef(false)

  const upload = useCallback(
    async (files: FileList | File[]) => {
      // The server answers 403 here anyway; catching it before the request
      // turns a failed upload into an explanation, and stops a drag-and-drop
      // of 40 files from spending the user's bandwidth to learn the same thing.
      if (locked) {
        toast.error("AutoDJ isn't included in your plan yet.")
        return
      }
      if (busy.current) return

      const list = Array.from(files).filter(isAudioFile)
      if (list.length === 0) {
        toast.error("No audio files in selection.")
        return
      }

      const totalBytes = list.reduce((sum, f) => sum + f.size, 0)
      const startedAt = Date.now()

      let publishedAt = 0
      /** Push a byte offset into the selection out as a rendered meter. */
      const publish = (sentBytes: number, processing: boolean, force = false) => {
        // Progress events arrive per chunk — dozens a second on a fast link —
        // and each one re-renders a list that can be hundreds of rows. 10 Hz
        // is past what anyone reads and well inside what the browser can
        // paint while it is also pushing a 300 MB file.
        const now = Date.now()
        if (!force && now - publishedAt < 100) return
        publishedAt = now

        // Walk the flat selection to see how much of it this offset covers.
        // Counting against the byte stream rather than against batch
        // boundaries is what lets the label say "4 of 12" while the fourth
        // file is still going up. Linear, but the lists here are tens of files.
        let seen = 0
        let filesSent = 0
        for (const file of list) {
          if (seen + file.size > sentBytes) break
          seen += file.size
          filesSent++
        }

        const elapsed = (now - startedAt) / 1000
        const rate = elapsed > 1 && sentBytes > 0 ? sentBytes / elapsed : null

        setProgress({
          totalFiles: list.length,
          filesSent,
          currentFile: list[filesSent]?.name ?? null,
          totalBytes,
          sentBytes,
          processing,
          bytesPerSecond: rate,
          secondsLeft: rate === null ? null : Math.round((totalBytes - sentBytes) / rate),
        })
      }

      busy.current = true
      publish(0, false, true)

      try {
        // A drop too large for one multipart body goes up as several requests,
        // each committed on its own — a batch that landed stays landed even if
        // a later one trips the quota.
        const batches = batchFiles(list)
        let added = 0
        let done = 0
        let failure: string | null = null

        for (const batch of batches) {
          const batchBytes = batch.reduce((sum, f) => sum + f.size, 0)
          const form = new FormData()
          // `kind` is the only difference between the two surfaces, which is
          // what keeps quota, tag reading and storage identical across both.
          if (kind) form.append("kind", kind)
          for (const file of batch) form.append("files[]", file)

          const { data } = await api.post<{
            data: Track[]
            errors: { index: number; message: string }[]
          }>(`/stations/${slug}/tracks`, form, {
            // FormData → axios sets the multipart boundary automatically; this
            // override removes the json default the axios instance applies.
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress: (e) => {
              // Scale by the ratio rather than adding `loaded` directly: the
              // body carries multipart framing on top of the files, so
              // `loaded` overshoots the sizes the labels quote.
              const ratio = e.total ? Math.min(e.loaded / e.total, 1) : 0
              // Not `=== 1`: the last event does not always land exactly on
              // the total, and the wait for the server's answer is the part
              // that most needs its own label.
              const sent = ratio > 0.999
              publish(done + batchBytes * ratio, sent, sent)
            },
          })

          done += batchBytes
          // Sent, but the next batch has not started: honest as "uploading"
          // only if there is one, and as "processing" otherwise.
          publish(done, done >= totalBytes, true)

          // Server-assigned positions are already correct (max+1, max+2, …).
          onUploaded(data.data)
          added += data.data.length

          if (data.errors.length > 0) {
            // The quota tripped mid-batch; every later batch would trip it too.
            failure = data.errors[0].message
            break
          }
        }

        if (failure !== null) {
          toast.error(failure)
        } else {
          toast.success(`Added ${added} ${noun}${added === 1 ? "" : "s"}.`)
        }
      } catch (err: unknown) {
        toast.error(uploadErrorMessage(err))
      } finally {
        busy.current = false
        setProgress(null)
      }
    },
    [slug, kind, noun, onUploaded, locked],
  )

  return { progress, uploading: progress !== null, upload }
}
