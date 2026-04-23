import { useState, useEffect, useRef } from 'react'

interface AudioLevels {
  left: number   // 0–1
  right: number  // 0–1
}

/**
 * Reads real-time audio levels from a MediaStream using Web Audio API.
 * Returns normalized L/R values (0–1) updated every animation frame.
 */
export function useAudioLevels(stream: MediaStream | null): AudioLevels {
  const [levels, setLevels] = useState<AudioLevels>({ left: 0, right: 0 })
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const hadStreamRef = useRef(false)

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      // Only reset if we previously had a live stream — avoids the
      // cascading-render warning when the hook initializes with no stream.
      if (hadStreamRef.current) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLevels({ left: 0, right: 0 })
        hadStreamRef.current = false
      }
      return
    }
    hadStreamRef.current = true

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)

    // Splitter for stereo analysis
    const splitter = ctx.createChannelSplitter(2)
    source.connect(splitter)

    const analyserL = ctx.createAnalyser()
    const analyserR = ctx.createAnalyser()
    analyserL.fftSize = 256
    analyserR.fftSize = 256
    analyserL.smoothingTimeConstant = 0.5
    analyserR.smoothingTimeConstant = 0.5

    splitter.connect(analyserL, 0)
    // Mono sources only have channel 0; wrap in try for safety
    try { splitter.connect(analyserR, 1) } catch { splitter.connect(analyserR, 0) }

    const bufL = new Uint8Array(analyserL.frequencyBinCount)
    const bufR = new Uint8Array(analyserR.frequencyBinCount)

    function tick() {
      analyserL.getByteFrequencyData(bufL)
      analyserR.getByteFrequencyData(bufR)

      // RMS-like average normalized to 0–1
      let sumL = 0, sumR = 0
      for (let i = 0; i < bufL.length; i++) {
        sumL += bufL[i]
        sumR += bufR[i]
      }
      const left = sumL / (bufL.length * 255)
      const right = sumR / (bufR.length * 255)

      setLevels({ left, right })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      source.disconnect()
      ctx.close()
      ctxRef.current = null
    }
  }, [stream])

  return levels
}
