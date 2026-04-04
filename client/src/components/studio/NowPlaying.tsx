import { useState, useEffect, useRef } from 'react'
import { useBroadcast } from '../../contexts/BroadcastContext'

function useAudioLevel(analyser: AnalyserNode | null): number {
  const [level, setLevel] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!analyser) {
      setLevel(0)
      return
    }

    const buf = new Uint8Array(analyser.fftSize)

    function tick() {
      analyser!.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const val = (buf[i] - 128) / 128
        sum += val * val
      }
      const rms = Math.sqrt(sum / buf.length)
      setLevel(Math.min(1, rms * 0.8))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser])

  return level
}

export default function NowPlaying() {
  const { engine, state } = useBroadcast()
  const analyser = engine?.getAnalyser() ?? null
  const level = useAudioLevel(analyser)
  const [, forceUpdate] = useState(0)
  const isLive = state === 'live'

  useEffect(() => {
    if (!isLive) return
    const timer = setInterval(() => forceUpdate((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [isLive])

  const track = engine?.getCurrentTrack() ?? null
  const playing = engine?.isPlaying() ?? false
  const micActive = engine?.isMicActive() ?? false
  const pct = Math.round(level * 100)

  return (
    <div className="bg-white/[0.025] border border-border-subtle rounded-xl p-4 relative overflow-hidden">
      <div className="absolute -top-5 -right-5 w-[100px] h-[100px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-[10px] bg-gradient-to-br from-[#1a0533] to-[#2d1b69] flex items-center justify-center shrink-0 relative">
          {track ? (
            <span className="text-xl">♫</span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="1.5">
              <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
            </svg>
          )}
          {isLive && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-live rounded-full animate-live-dot border-2 border-[#1a0533]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {micActive ? (
            <>
              <div className="text-[10px] tracking-[1.5px] uppercase text-red-500 mb-0.5">Mic live — talk over</div>
              <div className="text-[15px] font-medium text-text-secondary truncate">Speaking...</div>
            </>
          ) : track ? (
            <>
              <div className="text-[10px] tracking-[1.5px] uppercase text-emerald-live mb-0.5">
                {playing ? 'Now playing' : 'Paused'}
              </div>
              <div className="text-[15px] font-medium text-text-secondary truncate">{track.title}</div>
              <div className="text-xs text-text-muted mt-px">{track.artist}</div>
            </>
          ) : (
            <>
              <div className="text-[10px] tracking-[1.5px] uppercase text-text-ghost mb-0.5">
                {isLive ? 'On air' : 'Offline'}
              </div>
              <div className="text-[15px] font-medium text-text-muted truncate">
                {isLive ? 'Add files to queue to start playing' : 'Not broadcasting'}
              </div>
            </>
          )}
        </div>

        {isLive && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-live tracking-wide uppercase ml-2">
            <div className="w-[5px] h-[5px] bg-emerald-live rounded-full animate-live-dot" />
            On air
          </div>
        )}
      </div>

      {/* Audio level meter — single bar */}
      <div className="h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-[50ms]"
          style={{
            width: `${pct}%`,
            background: pct > 85 ? '#ef4444' : pct > 60 ? '#8b5cf6' : '#8b5cf6',
          }}
        />
      </div>
    </div>
  )
}
