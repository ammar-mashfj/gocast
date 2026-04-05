import { useEffect, useRef } from 'react'

interface NoiseProps {
  opacity?: number
  grainSize?: number
  fps?: number
  className?: string
}

export default function Noise({ opacity = 0.15, grainSize = 2, fps = 20, className = '' }: NoiseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let lastTime = 0
    const interval = 1000 / fps

    function resize() {
      canvas!.width = canvas!.offsetWidth / grainSize
      canvas!.height = canvas!.offsetHeight / grainSize
    }

    function render(time: number) {
      animId = requestAnimationFrame(render)
      if (time - lastTime < interval) return
      lastTime = time

      const w = canvas!.width
      const h = canvas!.height
      const imageData = ctx!.createImageData(w, h)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }

      ctx!.putImageData(imageData, 0, 0)
    }

    resize()
    animId = requestAnimationFrame(render)

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
    }
  }, [grainSize, fps])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  )
}
