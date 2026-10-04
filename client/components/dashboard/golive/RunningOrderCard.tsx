"use client"

import { useRef, useState } from "react"
import { IconLoader2, IconPlus } from "@tabler/icons-react"
import type { usePreflightQueue } from "@/hooks/usePreflightQueue"
import { formatBytes, formatTrackTime } from "@/lib/format"
import { QUEUE_BYTE_LIMIT } from "@/lib/audioEngine"
import { queueMeta } from "@/lib/preflightQueue"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { ChoiceCards } from "@/components/ds/ChoiceCards"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { List } from "@/components/ds/List"

const FORMATS = "MP3, M4A, AAC, FLAC, OGG or WAV"

/**
 * The show's running order, before the show: what will play, in order, with
 * Remove on each; "+ Add files" and drag-and-drop to add more. When the last
 * show stopped part-way through a song, the host picks whether to pick up
 * there or start over. Lives in this browser (IndexedDB), the same queue the
 * studio plays from.
 */
export function RunningOrderCard({
  queue,
  resumeFromStart,
  onResumeFromStartChange,
}: {
  queue: ReturnType<typeof usePreflightQueue>
  resumeFromStart: boolean
  onResumeFromStartChange: (fromStart: boolean) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [clearing, setClearing] = useState(false)
  const { tracks, savedSpot } = queue

  if (queue.unavailable) {
    return (
      <Card>
        <CardHeader title="Your running order" />
        <p className="text-sm text-muted-foreground">
          This browser won’t let GoCast keep files (private browsing, or storage blocked). You can still add them in the studio once you’re live; they won’t be kept for next time.
        </p>
      </Card>
    )
  }

  return (
    <Card
      size="none"
      className={cn("gap-2 rounded-card p-5.5 outline-offset-4", dragging && "outline-2 outline-dashed outline-line-strong")}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) void queue.add(e.dataTransfer.files)
      }}
    >
      <CardHeader title="Your running order" aside={tracks ? <span className="font-mono">{queueMeta(tracks)}</span> : null} />

      {tracks === null ? (
        <div className="h-24" aria-busy />
      ) : tracks.length === 0 ? (
        <div className="rounded-button border-stroke border-dashed border-line-strong p-5.5 text-center text-sm text-muted-foreground">
          Nothing to play yet. Add files, or drop them here.
        </div>
      ) : (
        <List>
          {tracks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className="w-5 shrink-0 font-mono text-caption text-text-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {t.title}
                {t.artist && <span className="font-medium text-text-faint"> · {t.artist}</span>}
              </span>
              <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">{t.duration > 0 ? formatTrackTime(t.duration) : ""}</span>
              <Button variant="quiet" size="sm" className="-mr-2" onClick={() => queue.remove(t.id)} aria-label={`Remove ${t.title}`}>
                Remove
              </Button>
            </li>
          ))}
        </List>
      )}

      {savedSpot && (
        <ChoiceCards
          aria-label="Where to start"
          size="sm"
          className="mt-2"
          value={resumeFromStart ? "over" : "pick-up"}
          onChange={(v) => onResumeFromStartChange(v === "over")}
          options={[
            {
              value: "pick-up",
              title: "Pick up where you stopped",
              description: `${savedSpot.track.title}, at ${formatTrackTime(savedSpot.offset)}`,
            },
            { value: "over", title: "Start over", description: "Same song, from 0:00" },
          ]}
        />
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button onClick={() => input.current?.click()} disabled={queue.adding || tracks === null}>
          {queue.adding ? <IconLoader2 className="animate-spin" /> : <IconPlus />}
          Add files
        </Button>
        {tracks && tracks.length > 0 && (
          <Button variant="quiet" onClick={() => setClearing(true)}>
            Clear
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void queue.add(e.target.files)
            e.target.value = ""
          }}
        />
        {/* The browser keeps the files, up to a cap: how much of it is used. */}
        {tracks && tracks.length > 0 && (
          <span className="ml-auto font-mono text-caption text-text-faint tabular-nums">
            {formatBytes(tracks.reduce((sum, t) => sum + t.file.size, 0))} of {formatBytes(QUEUE_BYTE_LIMIT)}
          </span>
        )}
      </div>
      <p className="text-body-sm text-text-faint">Or drop audio files onto the list. {FORMATS}.</p>

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        onConfirm={async () => {
          await queue.clear()
          setClearing(false)
        }}
        title="Clear your running order?"
        description="The files are removed from this browser, and the saved spot with them. The files on your computer aren’t touched."
        confirmLabel={`Clear ${tracks?.length ?? 0} ${tracks?.length === 1 ? "track" : "tracks"}`}
        keepLabel="Keep them"
      />
    </Card>
  )
}
