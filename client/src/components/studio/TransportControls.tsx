import { useState, useEffect } from 'react'
import { useBroadcast } from '../../contexts/BroadcastContext'

const CTRL = 'w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all bg-transparent border-none'

export default function TransportControls() {
  const { engine } = useBroadcast()
  const [, forceUpdate] = useState(0)

  // Re-render on engine state changes
  useEffect(() => {
    const timer = setInterval(() => forceUpdate((n) => n + 1), 300)
    return () => clearInterval(timer)
  }, [])

  const playing = engine?.isPlaying() ?? false
  const repeat = engine?.isRepeat() ?? false
  const hasQueue = (engine?.getQueue().length ?? 0) > 0

  return (
    <div className="flex items-center gap-2 bg-white/[0.02] border border-border-subtle rounded-[10px] px-4 py-3">
      {/* Prev */}
      <button
        className={`${CTRL} ${hasQueue ? 'text-text-faint hover:bg-white/5 hover:text-text-secondary' : 'text-text-dim cursor-default'}`}
        onClick={() => engine?.prev()}
        disabled={!hasQueue}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
      </button>

      {/* Play/Pause */}
      <button
        className={`w-11 h-11 rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
          hasQueue
            ? 'bg-violet-subtle border-violet-border text-violet'
            : 'bg-white/[0.02] border-border-subtle text-text-ghost cursor-default'
        }`}
        onClick={() => engine?.togglePlay()}
        disabled={!hasQueue}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
        )}
      </button>

      {/* Next */}
      <button
        className={`${CTRL} ${hasQueue ? 'text-text-faint hover:bg-white/5 hover:text-text-secondary' : 'text-text-dim cursor-default'}`}
        onClick={() => engine?.next()}
        disabled={!hasQueue}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
      </button>

      {/* Repeat */}
      <button
        className={`${CTRL} ${repeat ? 'bg-violet-full/10 text-violet' : 'text-text-faint hover:bg-white/5 hover:text-text-secondary'}`}
        onClick={() => engine?.toggleRepeat()}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" />
          <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>

      <div className="flex-1" />

      <span className="text-[10px] text-text-dim px-1.5 py-0.5 bg-white/[0.03] rounded">K</span>
    </div>
  )
}
