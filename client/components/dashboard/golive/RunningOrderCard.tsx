"use client"

import { useRef, useState } from "react"
import { IconChevronDown, IconGripVertical, IconLoader2, IconMusic, IconPlayerPlayFilled, IconPlus, IconX } from "@tabler/icons-react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { PreflightTrack } from "@/lib/preflightQueue"
import type { usePreflightQueue } from "@/hooks/usePreflightQueue"
import { formatBytes, formatTrackTime } from "@/lib/format"
import { QUEUE_BYTE_LIMIT } from "@/lib/audioEngine"
import { queueMeta } from "@/lib/preflightQueue"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { List } from "@/components/ds/List"
import { Segmented } from "@/components/ds/Segmented"

const FORMATS = "MP3, M4A, AAC, FLAC, OGG or WAV"

/**
 * The show's running order, before the show: what will play, in order, with
 * Remove on each; "+ Add files" and drag-and-drop to add more. When the last
 * show stopped part-way through a song, the host picks whether to pick up
 * there or start over. Lives in this browser (IndexedDB), the same queue the
 * studio plays from.
 */
interface RunningOrderProps {
  queue: ReturnType<typeof usePreflightQueue>
  resumeFromStart: boolean
  onResumeFromStartChange: (fromStart: boolean) => void
  /** The host dragged a track: the page switches to "From the top" (on screen only). */
  onReorder?: () => void
  /** Size the section (the Go live page's right column); a capped one scrolls its track list. */
  className?: string
}

/**
 * From lg, the card in the page's right column. Below lg, a one-line row
 * (MusicRow) that expands into the same card in place, so a phone's page is
 * header, mode, mic and music rows with nothing to scroll until it's opened. Storage blocked
 * is a notice to read, so it shows in full at every size.
 */
export function RunningOrderCard(props: RunningOrderProps) {
  if (props.queue.unavailable) return <QueueCard {...props} />
  return (
    <>
      <QueueCard {...props} className={cn(props.className, "max-lg:hidden")} />
      <MusicRow {...props} className="lg:hidden" />
    </>
  )
}

function QueueCard({
  queue,
  resumeFromStart,
  onResumeFromStartChange,
  onReorder,
  className,
  bare = false,
}: RunningOrderProps & {
  /** Inside MusicRow's expanded card: the row is the heading and the fill, so neither here. */
  bare?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [clearing, setClearing] = useState(false)
  // Clearing IndexedDB takes a moment; the dialog holds until it's done.
  const [clearPending, setClearPending] = useState(false)
  const { tracks, savedSpot } = queue
  // The studio's sensors (components/studio/FileQueue): a short drag or a
  // touch hold starts a move, so taps and scrolling still work.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !tracks) return
    queue.move(
      tracks.findIndex((t) => t.id === active.id),
      tracks.findIndex((t) => t.id === over.id),
    )
    onReorder?.()
  }
  // The row the show will open on, marked in the list. Only worth saying
  // when there's a saved spot; otherwise it's plainly track 1.
  const startId = savedSpot ? (resumeFromStart ? tracks?.[0]?.id : savedSpot.track.id) : null
  const startAt = savedSpot && !resumeFromStart ? formatTrackTime(savedSpot.offset) : "0:00"

  if (queue.unavailable) {
    return (
      <Section className={className}>
        <Card>
          <p className="text-sm text-muted-foreground">
            This browser won’t let GoCast keep files (private browsing, or storage blocked). You can still add them in the studio once you’re live; they won’t be kept for next time.
          </p>
        </Card>
      </Section>
    )
  }

  return (
    <Section className={className} meta={tracks && tracks.length > 0 ? queueMeta(tracks) : null} bare={bare}>
      <Card
        size="none"
        className={cn(
          "min-h-0 flex-1 gap-2 rounded-card p-5.5 outline-offset-4",
          bare && "bg-transparent p-0",
          dragging && "outline-2 outline-dashed outline-line-strong",
        )}
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
        {/* The empty state says it already; this line is for a loaded list. */}
        {!bare && tracks && tracks.length > 0 && (
          <p className="text-body-sm text-muted-foreground">You can add or change music in the studio anytime, even while you’re live.</p>
        )}

        {/* Where the show starts, when the last one left a saved spot: carry
            on where it stopped (right after a crash or a refresh), or play
            the list from the top. Above the list so it's read first.
            Reordering picks "From the top" on screen — a new order is a new
            show — without touching the saved spot. The starting row is
            marked ▶ in the list. Always two rows: the switch on its own line
            never jumps between layouts as the title changes length. */}
        {savedSpot && tracks && tracks.length > 0 && (
          <div className="flex flex-col gap-3 rounded-well bg-surface-inset p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-on-air/18 text-on-air-text">
                <IconPlayerPlayFilled size={14} aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="eyebrow text-text-faint">Show starts</span>
                <span className="truncate text-sm font-semibold">
                  {resumeFromStart
                    ? `“${tracks[0].title}”, from the top`
                    : `“${savedSpot.track.title}” at ${formatTrackTime(savedSpot.offset)}`}
                </span>
              </div>
            </div>
            <Segmented
              size="sm"
              aria-label="Where the show starts"
              value={resumeFromStart ? "top" : "pick-up"}
              onChange={(v) => onResumeFromStartChange(v === "top")}
              options={[
                { value: "pick-up", label: "Where you stopped" },
                { value: "top", label: "From the top" },
              ]}
            />
          </div>
        )}

        {tracks === null ? (
          <div className="h-24" aria-busy />
        ) : tracks.length === 0 ? (
          <div className="rounded-button border-stroke border-dashed border-line-strong px-4 py-3.5 text-center text-sm text-muted-foreground">
            No music yet. Add some now, or later from the studio.
          </div>
        ) : (
          // Scrolls once the card is capped; the padding keeps Remove's -mr-2 unclipped.
          <div className="-mr-2 min-h-0 overflow-y-auto pr-2">
            <DndContext id={bare ? "preflight-queue-inline" : "preflight-queue"} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <List>
                  {tracks.map((t, i) => (
                    <SortableRow
                      key={t.id}
                      track={t}
                      position={i + 1}
                      startsAt={t.id === startId ? startAt : null}
                      onRemove={() => queue.remove(t.id)}
                    />
                  ))}
                </List>
              </SortableContext>
            </DndContext>
          </div>
        )}


        {/* mt-auto: the card stretches to the left column, so the actions
            and the hint sit at its foot rather than under a short list. */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1.5">
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
        {/* Dropping files is a desktop gesture; phones and tablets only need the formats. */}
        <p className="text-body-sm text-text-faint">
          <span className="max-lg:hidden">Or drop audio files onto the list. </span>
          {FORMATS}.
        </p>

        <ConfirmDialog
          open={clearing}
          onOpenChange={setClearing}
          busy={clearPending}
          onConfirm={async () => {
            setClearPending(true)
            try {
              await queue.clear()
            } finally {
              setClearPending(false)
              setClearing(false)
            }
          }}
          title="Clear your running order?"
          description="The files are removed from this browser, and the saved spot with them. The files on your device aren’t touched."
          confirmLabel={`Clear ${tracks?.length ?? 0} ${tracks?.length === 1 ? "track" : "tracks"}`}
          keepLabel="Keep them"
        />
      </Card>
    </Section>
  )
}

/** One track. Only the grip drags, so Remove stays its own button (see FileQueue's SortableRow). */
function SortableRow({
  track,
  position,
  startsAt,
  onRemove,
}: {
  track: PreflightTrack
  position: number
  /** The show opens on this row, at this time ("1:23", "0:00"). */
  startsAt: string | null
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 py-2.5", isDragging && "relative z-10 rounded-item bg-popover shadow-lg")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${track.title}`}
        className="-ml-1.5 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-tag text-text-faint hover:text-foreground active:cursor-grabbing"
      >
        <IconGripVertical size={16} />
      </button>
      <span className="w-5 shrink-0 font-mono text-caption text-text-faint">{position}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {track.title}
        {track.artist && <span className="font-medium text-text-faint"> · {track.artist}</span>}
      </span>
      {startsAt && (
        <span className="flex shrink-0 items-center gap-1 rounded-tag bg-on-air/18 px-1.5 py-0.5 font-mono text-micro font-semibold text-on-air-text tabular-nums">
          <IconPlayerPlayFilled size={10} aria-hidden />
          {startsAt}
          <span className="sr-only">, the show starts here</span>
        </span>
      )}
      <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">{track.duration > 0 ? formatTrackTime(track.duration) : ""}</span>
      <Button variant="quiet" size="icon-sm" className="-mr-2" onClick={onRemove} aria-label={`Remove ${track.title}`} title="Remove">
        <IconX />
      </Button>
    </li>
  )
}

/** The column's label outside the card, like "What goes out" beside it, with the list's size on the right. */
function Section({
  className,
  meta,
  bare = false,
  children,
}: {
  className?: string
  meta?: string | null
  bare?: boolean
  children: React.ReactNode
}) {
  if (bare) return <div className={cn("flex min-w-0 flex-col gap-2.5", className)}>{children}</div>
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
      aria-labelledby="music-label"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="music-label" className="font-display text-body font-bold">Music to start with <span className="font-normal text-muted-foreground">(optional)</span></h2>
        {meta && <span className="font-mono text-caption text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * Below lg: the music as one row, like the mic row above it, that expands in
 * place into the full list — the pinned Go live stays in view while editing,
 * which a sheet covered. Collapsed by default so the page fits one screen.
 * It says what will play first when the last show left a saved spot: that
 * choice decides the opening song, so it stays visible when collapsed.
 * Empty, there is nothing to expand: Add opens the file picker directly.
 */
function MusicRow(props: RunningOrderProps) {
  const { queue, resumeFromStart, className } = props
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { tracks, savedSpot } = queue
  const has = !!tracks && tracks.length > 0
  const expanded = open && has

  const summary = !tracks
    ? "Loading your music…"
    : !has
      ? "No music yet"
      : savedSpot && !resumeFromStart
        ? `${queueMeta(tracks)} · picks up in “${savedSpot.track.title}” at ${formatTrackTime(savedSpot.offset)}`
        : `${queueMeta(tracks)} ready`

  return (
    <div className={cn("rounded-panel bg-card", className)}>
      <button
        type="button"
        onClick={() => (has ? setOpen((o) => !o) : input.current?.click())}
        disabled={!tracks || queue.adding}
        aria-expanded={has ? expanded : undefined}
        className="flex min-h-16 w-full items-center gap-3 rounded-panel px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconMusic size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">Music to start with</span>
          <span className="truncate text-body-sm text-muted-foreground">{summary}</span>
        </span>
        {has ? (
          <IconChevronDown
            size={18}
            aria-hidden
            className={cn("shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")}
          />
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
            {queue.adding ? <IconLoader2 size={16} className="animate-spin" /> : <IconPlus size={16} aria-hidden />}
            Add
          </span>
        )}
      </button>

      {/* 0fr → 1fr animates to the content's own height; inert while closed
          so the hidden list's buttons aren't in the tab order. */}
      {has && (
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="min-h-0 overflow-hidden" inert={!expanded}>
            <div className="border-t border-line px-4 pt-2 pb-4">
              <QueueCard {...props} className={undefined} bare />
            </div>
          </div>
        </div>
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
    </div>
  )
}
