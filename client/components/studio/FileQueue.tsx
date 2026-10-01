"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import { IconPlus, IconX, IconGripVertical, IconUpload, IconTrash } from "@tabler/icons-react"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Button } from "@/components/ds/Button"
import { QUEUE_BYTE_LIMIT, type QueueTrack, type RepeatMode } from "@/lib/audioEngine"
import { formatBytes, formatTrackTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const clockTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * Run a queue edit inside a view transition, so the rows below a removed
 * track glide up instead of jumping. Plain call where the API is missing or
 * the user asked for less motion.
 *
 * Only rows fully inside the scroller get a transition name, and only for
 * the length of the transition. Snapshots are drawn in the top layer, outside
 * the list's overflow clip: with a permanent name on every row, the rows
 * scrolled out of view painted over the deck and the lamp for the whole
 * animation.
 */
function withRowTransition(scroller: HTMLElement | null, update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }
  if (!scroller || !doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update()
    return
  }
  const box = scroller.getBoundingClientRect()
  const named: HTMLElement[] = []
  scroller.querySelectorAll<HTMLElement>("[data-queue-row]").forEach((row) => {
    const r = row.getBoundingClientRect()
    if (r.top < box.top || r.bottom > box.bottom) return
    row.style.viewTransitionName = `q-${row.dataset.queueRow}`
    named.push(row)
  })
  const clear = () => named.forEach((row) => (row.style.viewTransitionName = ""))
  doc.startViewTransition(() => flushSync(update)).finished.then(clear, clear)
}

interface SortableRowProps {
  track: QueueTrack
  position: number
  isPlaying: boolean
  /** Wall-clock time this track is projected to start, or null if unknowable. */
  airsAt: Date | null
  onRemove: () => void
}

/**
 * One line of the running order. Only the grip is the drag handle: when the
 * whole row carried dnd-kit's attributes, the row was a button with the
 * remove button nested inside it, and a screen reader announced every track
 * as "sortable button" with no way to reach the remove action on its own.
 */
function SortableRow({ track, position, isPlaying, airsAt, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id })

  return (
    <li
      ref={setNodeRef}
      // Named for the remove/undo view transition by withRowTransition,
      // only while one runs.
      data-queue-row={track.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        // Handle 32px, number left-aligned in a column just wide enough for
        // two digits, 6px gaps: the old 36px handle, 8px gaps and a
        // right-aligned digit in a 28px column left ~40px of nothing
        // between the grip and the number on a phone.
        "grid min-h-12 grid-cols-[32px_minmax(1.25rem,auto)_minmax(0,1fr)_auto_36px] items-center gap-1.5 rounded-chip py-1.5 pr-1 transition-colors sm:grid-cols-[32px_minmax(1.25rem,auto)_minmax(0,1fr)_auto_52px_36px]",
        isDragging && "relative z-10 bg-popover shadow-lg",
        isPlaying ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${track.title}`}
        className="flex size-8 cursor-grab touch-none items-center justify-center rounded-tag text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <IconGripVertical size={20} />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {position}
      </span>
      {/* No empty artist line: it made the text block two lines tall, so a
          title without an artist sat above the row's centre while the
          number and controls sat on it. min-h on the row keeps the height
          steady between tagged and untagged tracks instead. */}
      <div className="min-w-0">
        <div className={cn("truncate text-sm", isPlaying && "font-semibold")}>{track.title}</div>
        {track.artist && <div className="truncate text-xs text-muted-foreground">{track.artist}</div>}
      </div>
      <div className="whitespace-nowrap text-xs">
        {isPlaying ? (
          <span className="font-mono text-micro font-semibold uppercase tracking-widest text-foreground">
            Playing
          </span>
        ) : airsAt ? (
          <span className="font-mono text-muted-foreground tabular-nums">{clockTime(airsAt)}</span>
        ) : null}
      </div>
      <div className="hidden text-right font-mono text-xs text-muted-foreground tabular-nums sm:block">
        {formatTrackTime(track.duration)}
      </div>
      <Button
        variant="quiet"
        size="icon"
        className="size-9"
        onClick={onRemove}
        aria-label={`Remove ${track.title}`}
        title="Remove from the running order"
      >
        <IconX size={15} />
      </Button>
    </li>
  )
}

/**
 * The running order: what plays after the track on air, when each one airs,
 * and how long until the queue comes back round.
 *
 * Shared by both layouts now. The phone layout used to carry its own copy of
 * this list — no air times, no keyboard reordering, unlabelled buttons.
 */
export function FileQueue() {
  const { engine } = useBroadcast()
  const version = useEngineVersion(engine)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // `version` is the real dependency — engine mutates its queue array in place,
  // so we rely on the version bump from useEngineVersion to force a new memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => engine?.getQueue() ?? [], [engine, version])
  const currentIndex = engine?.getCurrentIndex() ?? -1

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!engine) return
    const { skipped, overLimit } = await engine.addFiles(files)
    if (overLimit) {
      const n = skipped.length
      toast.warning(
        `Queue is full — ${n} file${n === 1 ? "" : "s"} skipped`,
        { description: `Cap is ${formatBytes(QUEUE_BYTE_LIMIT)}. Remove tracks to free up space.` },
      )
    }
  }, [engine])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files: File[] = []
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i]
        if (item.kind === "file") {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    } else if (e.dataTransfer.files.length > 0) {
      files.push(...Array.from(e.dataTransfer.files))
    }
    if (files.length > 0) handleFiles(files)
  }, [handleFiles])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !engine) return
    const from = queue.findIndex((t) => t.id === active.id)
    const to = queue.findIndex((t) => t.id === over.id)
    if (from === -1 || to === -1) return
    engine.moveTrack(from, to)
  }, [engine, queue])

  /** Removal with a way back: the order is captured before anything moves. */
  const removeWithUndo = useCallback((ids: string[] | "upcoming") => {
    if (!engine) return
    const before = engine.getQueue()
    const order = before.map((t) => t.id)
    // Worked out here, not inside the transition: startViewTransition runs its
    // callback later, so anything it assigns is still empty on the next line.
    const current = engine.getCurrentTrack()
    const removed = ids === "upcoming"
      ? before.filter((t) => t !== current)
      : before.filter((t) => ids.includes(t.id))
    if (removed.length === 0) return
    withRowTransition(scrollerRef.current, () => {
      if (ids === "upcoming") {
        engine.clearUpcoming()
      } else {
        ids.forEach((id) => engine.removeTrack(id))
      }
    })
    toast(
      removed.length === 1 ? `Removed “${removed[0].title}”` : `Cleared ${removed.length} upcoming tracks`,
      {
        action: {
          label: "Undo",
          onClick: () => withRowTransition(scrollerRef.current, () => engine.restoreTracks(removed, order)),
        },
        duration: 6000,
      },
    )
  }, [engine])

  /**
   * Projected start time for every queued track, walking forward from where
   * the current one actually is. Null while nothing is playing — a queue that
   * hasn't started has no clock to hang these off, and inventing one would
   * put confident wrong times in front of the broadcaster.
   *
   * These drift the moment anyone skips, pauses, or opens the mic. That is
   * fine: they answer "roughly when do I need to be back", not "when exactly".
   */
  const airTimes = useMemo(() => {
    const times = new Array<Date | null>(queue.length).fill(null)
    if (!engine || currentIndex < 0 || !engine.isPlaying()) return times
    const current = queue[currentIndex]
    if (!current) return times
    // "Hold track" never reaches anything else, so nothing else gets a time.
    if (engine.getRepeatMode() === "one") return times
    let cursor = Date.now() + Math.max(0, current.duration - engine.getElapsed()) * 1000
    // The queue loops, so the tracks ABOVE the one on air are next after the
    // ones below it — walk round once, not just to the bottom of the list.
    for (let step = 1; step < queue.length; step++) {
      const i = (currentIndex + step) % queue.length
      times[i] = new Date(cursor)
      cursor += queue[i].duration * 1000
    }
    return times
    // Recomputed on every engine change (version), which is when a skip,
    // pause, or queue edit can have moved them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, queue, currentIndex, version])

  const repeatMode: RepeatMode = engine?.getRepeatMode() ?? "all"
  const totalDuration = queue.reduce((sum, t) => sum + t.duration, 0)
  const queueBytes = engine?.getQueueBytes() ?? 0
  const nearLimit = queueBytes / QUEUE_BYTE_LIMIT > 0.9
  const upcoming = queue.length - (currentIndex >= 0 ? 1 : 0)

  return (
    <section
      aria-labelledby="running-order-title"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={handleDrop}
      className={cn(
        // A card like the rest of the console; the edge only appears while a
        // file is dragged over it.
        "flex max-h-136 min-h-45 flex-col overflow-hidden rounded-card border bg-card transition-colors",
        dragOver ? "border-foreground/40" : "border-transparent",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ""
        }}
      />

      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="running-order-title" className="text-base font-bold">Running order</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {/* "Running order" is radio for the show's playlist; said once, here. */}
            Your show’s playlist · {queue.length} track{queue.length !== 1 ? "s" : ""} · {formatTrackTime(totalDuration)}
            {queue.length > 0 && (
              <span>
                {" · "}
                <span className={nearLimit ? "font-medium text-foreground" : undefined}>
                  {formatBytes(queueBytes)} of {formatBytes(QUEUE_BYTE_LIMIT)}
                </span>
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          {/* No "off": running off the end of a queue puts dead air on a live
              station, so the queue always continues. The only real choice is
              whether it moves on to the next track or holds this one. */}
          <div role="group" aria-label="When a track ends" className="flex gap-0.75 rounded-item bg-background p-0.75">
            {(["all", "one"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={repeatMode === mode}
                onClick={() => engine?.setRepeatMode(mode)}
                title={
                  mode === "all"
                    ? "Play through the running order, then start it again (R)"
                    : "Keep the current track on repeat (R)"
                }
                // Same weight in both states: bolding the active one widened it
                // and nudged its neighbours on every press (measured as a
                // layout shift per click). The fill and ring carry the state,
                // strong enough to read at a glance — Clarity showed people
                // toggling this four to six times to find out which was on.
                className={cn(
                  // The design system's Segmented: the choice is off-white.
                  "h-8 whitespace-nowrap rounded-segment px-2 text-xs font-semibold transition-colors sm:px-2.5",
                  repeatMode === mode
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === "all" ? "Repeat list" : "Repeat track"}
              </button>
            ))}
          </div>
          {queue.length > 0 && (
            // Icon-only on a phone, where the words push Add files off the
            // edge; it comes with an undo, so a bare icon is safe to press.
            // Kept in the row (invisible) whenever there is a queue, even with
            // nothing upcoming: mounting it as the first track started moved
            // Add files out from under the pointer.
            <Button
              variant="quiet"
              size="sm"
              className={cn("h-9", upcoming === 0 && "invisible")}
              title="Clear upcoming"
              disabled={upcoming === 0}
              aria-hidden={upcoming === 0 || undefined}
              onClick={() => removeWithUndo("upcoming")}
            >
              <IconTrash className="sm:hidden" />
              <span className="max-sm:sr-only">Clear upcoming</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-9 sm:ml-0" onClick={() => fileInputRef.current?.click()}>
            <IconPlus data-icon="inline-start" />
            Add files
          </Button>
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {queue.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-item border border-dashed border-input text-center transition-colors hover:border-foreground/30"
          >
            <IconUpload size={20} className="text-muted-foreground" />
            <span className="text-sm font-medium">Drop audio files here, or browse</span>
            <span className="max-w-xs text-xs text-muted-foreground">
              They play in order and loop, so the station never runs out. Files stay on this device.
            </span>
          </button>
        ) : (
          // Stable id — see the note in LibraryView. dnd-kit's generated ids
          // come from a module-scoped counter that the server process keeps
          // incrementing across requests, so they never match the browser's.
          <DndContext
            id="studio-file-queue"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={queue.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-0.5">
                {queue.map((track, i) => (
                  <SortableRow
                    key={track.id}
                    track={track}
                    position={i + 1}
                    isPlaying={i === currentIndex}
                    airsAt={airTimes[i]}
                    onRemove={() => removeWithUndo([track.id])}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {queue.length > 0 && (
        <p className="border-t border-border px-5 py-2 text-xs text-muted-foreground">
          {dragOver ? "Drop to add to the end of the running order" : "Drag files anywhere onto this panel to add them"}
        </p>
      )}
    </section>
  )
}
