import { useState, useEffect, useRef } from 'react'

/**
 * Reads frequency data from an AnalyserNode and returns
 * an array of normalized bar heights (0–1) for visualization.
 */
export function useAnalyserBars(analyser: AnalyserNode | null, barCount: number): number[] {
  const [bars, setBars] = useState<number[]>(() => Array(barCount).fill(0))
  const rafRef = useRef(0)

  useEffect(() => {
    if (!analyser) {
      setBars(Array(barCount).fill(0))
      return
    }

    const buf = new Uint8Array(analyser.frequencyBinCount)
    const step = Math.floor(analyser.frequencyBinCount / barCount)

    function tick() {
      analyser!.getByteFrequencyData(buf)

      const result: number[] = []
      for (let i = 0; i < barCount; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) {
          sum += buf[i * step + j]
        }
        result.push(sum / (step * 255))
      }

      setBars(result)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser, barCount])

  return bars
}
