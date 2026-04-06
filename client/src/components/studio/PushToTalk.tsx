import { useState, useEffect, useCallback } from 'react'
import { useBroadcast } from '../../contexts/BroadcastContext'
import { useAudioLevels } from '../../lib/useAudioLevels'

export default function PushToTalk() {
  const { engine, micStream, micDisabled } = useBroadcast()
  const micLevels = useAudioLevels(micStream)
  const [holding, setHolding] = useState(false)

  const activate = useCallback(() => {
    if (micDisabled) return
    engine?.pttDown()
    setHolding(true)
  }, [engine, micDisabled])

  const deactivate = useCallback(() => {
    if (micDisabled) return
    engine?.pttUp()
    setHolding(false)
  }, [engine, micDisabled])

  // Space bar
  useEffect(() => {
    if (micDisabled) return
    function onDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat && (e.target === document.body || e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        activate()
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === 'Space') deactivate()
    }
    document.addEventListener('keydown', onDown)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('keydown', onDown)
      document.removeEventListener('keyup', onUp)
    }
  }, [activate, deactivate, micDisabled])

  const micLevel = holding ? Math.max(micLevels.left, micLevels.right) : 0

  return (
    <div className={`bg-white/[0.02] border border-border-subtle rounded-xl p-4 flex items-center gap-4 ${micDisabled ? 'opacity-50' : ''}`}>
      <button
        onMouseDown={activate}
        onMouseUp={deactivate}
        onMouseLeave={deactivate}
        disabled={micDisabled}
        className={`w-16 h-16 rounded-full border-2 flex items-center justify-center shrink-0 select-none transition-all ${
          micDisabled
            ? 'bg-white/[0.03] border-white/[0.08] cursor-not-allowed'
            : holding
              ? 'bg-red-500/25 border-red-500/70 animate-ptt-glow cursor-pointer'
              : 'bg-red-500/[0.08] border-red-500/30 hover:bg-red-500/15 hover:border-red-500/50 cursor-pointer'
        }`}
      >
        <svg
          width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`transition-colors ${micDisabled ? 'text-text-dim' : holding ? 'text-red-500' : 'text-red-500/50'}`}
        >
          <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          {micDisabled ? (
            <line x1="2" y1="2" x2="22" y2="22" />
          ) : (
            <line x1="12" y1="19" x2="12" y2="22" />
          )}
        </svg>
      </button>

      <div className="flex-1">
        <div className={`text-[15px] font-medium mb-0.5 ${micDisabled ? 'text-text-dim' : holding ? 'text-red-500' : 'text-text-secondary'}`}>
          {micDisabled ? 'Microphone unavailable' : holding ? 'Mic is LIVE' : 'Hold to talk'}
        </div>
        <div className="text-[13px] text-text-ghost leading-relaxed">
          {micDisabled
            ? 'Microphone access was not granted. You can only stream files.'
            : 'Music ducks while you speak. Release to resume full volume.'}
        </div>
        {!micDisabled && (
          <div className="inline-flex items-center px-2 py-0.5 bg-white/[0.04] border border-border-faint rounded text-[10px] text-text-ghost tracking-wide mt-1.5">
            Hold SPACE
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] text-text-dim tracking-wide uppercase">Mic</span>
        <div className="w-1.5 h-10 bg-white/[0.04] rounded-sm overflow-hidden flex flex-col-reverse">
          <div
            className="w-full rounded-sm transition-[height] duration-75"
            style={{
              height: `${micLevel * 100}%`,
              background: micLevel > 0.8 ? '#ef4444' : micLevel > 0.5 ? '#fbbf24' : '#34d399',
            }}
          />
        </div>
      </div>
    </div>
  )
}
