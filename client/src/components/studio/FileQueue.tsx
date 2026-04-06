import { useState, useEffect, useRef, useCallback } from 'react'
import { useBroadcast } from '../../contexts/BroadcastContext'
import type { QueueTrack } from '../../lib/audioEngine'
import { IconMinus, IconPlus, IconX } from '@tabler/icons-react'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function DragHandle() {
  return (
    <div className="flex flex-col gap-[1.5px] items-center cursor-grab">
      <span className="block w-2 h-[1.5px] bg-white/10 rounded-sm" />
      <span className="block w-2 h-[1.5px] bg-white/10 rounded-sm" />
      <span className="block w-2 h-[1.5px] bg-white/10 rounded-sm" />
    </div>
  )
}

const GRADIENTS = [
  'linear-gradient(135deg,#1a0533,#2d1b69)',
  'linear-gradient(135deg,#0f1a2b,#1a3355)',
  'linear-gradient(135deg,#1a1a0f,#33331a)',
  'linear-gradient(135deg,#0f2b1a,#1a5533)',
  'linear-gradient(135deg,#2b0f1a,#551a33)',
]

const ICONS = ['♫', '♬', '♩', '♪', '♫']

export default function FileQueue() {
  const { engine } = useBroadcast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueueTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [, forceUpdate] = useState(0)
  const [dragOverZone, setDragOverZone] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Sync queue state from engine
  useEffect(() => {
    if (!engine) return
    const timer = setInterval(() => {
      setQueue([...engine.getQueue()])
      setCurrentIndex(engine.getCurrentIndex())
      forceUpdate((n) => n + 1)
    }, 300)
    return () => clearInterval(timer)
  }, [engine])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!engine) return
    await engine.addFiles(files)
  }, [engine])

  // ── Drop zone (add files from OS) ──

  const handleDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverZone(false)

    const files: File[] = []
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    } else if (e.dataTransfer.files.length > 0) {
      files.push(...Array.from(e.dataTransfer.files))
    }

    if (files.length > 0) handleFiles(files)
  }, [handleFiles])

  // ── Drag to reorder ──

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    // Needed for Firefox
    e.dataTransfer.setData('text/plain', String(idx))
  }, [])

  const handleDragOverItem = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }, [])

  const handleDropOnItem = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    e.stopPropagation()

    if (dragIdx === null || dragIdx === toIdx || !engine) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }

    // Reorder the queue
    const q = engine.getQueue()
    const [moved] = q.splice(dragIdx, 1)
    q.splice(toIdx, 0, moved)

    setDragIdx(null)
    setDragOverIdx(null)
  }, [dragIdx, engine])

  const totalDuration = queue.reduce((sum, t) => sum + t.duration, 0)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="text-sm tracking-[2px] uppercase text-text-ghost">Up next</div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-text-dim">
            {queue.length} track{queue.length !== 1 ? 's' : ''} · {formatDuration(totalDuration)}
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-sm text-violet-muted bg-transparent border-none cursor-pointer px-2.5 py-1 rounded hover:bg-violet-full/[0.08] hover:text-violet transition-all"
          >
            <IconPlus size={20} />
             Add files
          </button>
          {queue.length > 0 && (
            <button
              onClick={() => engine?.clearQueue()}
              className="flex items-center gap-1 text-sm text-violet-muted bg-transparent border-none cursor-pointer px-2.5 py-1 rounded hover:bg-violet-full/[0.08] hover:text-violet transition-all"
            >
             <IconMinus size={20}/> Clear
            </button>
          )}
        </div>
      </div>

      {/* Track list */}
      <div className="flex flex-col gap-0.5 overflow-y-auto flex-1">
        {queue.map((track, i) => {
          const isPlaying = i === currentIndex
          const isDragging = dragIdx === i
          const isDragOver = dragOverIdx === i
          return (
            <div
              key={track.id}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOverItem(e, i)}
              onDrop={(e) => handleDropOnItem(e, i)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              className={`grid grid-cols-[16px_32px_1fr_40px_24px] items-center gap-2 px-2.5 py-2 rounded-md border transition-all ${
                isDragging ? 'opacity-30' : ''
              } ${isDragOver ? 'border-violet-border bg-violet-full/[0.06]' : ''} ${
                isPlaying
                  ? 'bg-violet-full/[0.04] border-violet-full/[0.12]'
                  : 'border-transparent hover:bg-white/[0.02] hover:border-white/[0.04]'
              }`}
            >
              <DragHandle />
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center text-xs shrink-0"
                style={{ background: GRADIENTS[i % GRADIENTS.length] }}
              >
                {ICONS[i % ICONS.length]}
              </div>
              <div className="min-w-0">
                <div className={`text-sm truncate ${isPlaying ? 'text-text-secondary font-medium' : 'text-text-secondary'}`}>
                  {track.title}
                </div>
                <div className="text-sm text-text-ghost truncate">{track.artist}</div>
              </div>
              <div className="text-sm text-text-dim text-right tabular-nums">
                {formatDuration(track.duration)}
              </div>
              <button
                onClick={() => engine?.removeTrack(track.id)}
                className="w-[18px] h-[18px] rounded flex items-center justify-center cursor-pointer text-text-dim text-xs bg-transparent border-none hover:text-red-500/50 hover:bg-red-500/[0.06] transition-all"
              >
                <IconX />
              </button>
            </div>
          )
        })}
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOverZone(true) }}
        onDragLeave={() => setDragOverZone(false)}
        onDrop={handleDropZone}
        className={`border border-dashed rounded-lg py-4 text-center cursor-pointer mt-1.5 transition-all ${
          dragOverZone
            ? 'border-violet-border bg-violet-full/[0.04]'
            : 'border-white/[0.06] hover:border-violet-border/40 hover:bg-violet-full/[0.02]'
        }`}
      >
        <div className="text-sm text-text-ghost">
          Drop audio files here or <span className="text-violet-muted">browse</span>
        </div>
      </div>
    </div>
  )
}
