/**
 * Off-main-thread MP3 encoder.
 *
 * Receives Float32Array PCM samples from the AudioWorklet via a
 * MessagePort and emits encoded MP3 chunks back to the main thread.
 * Keeps lamejs and the per-chunk encoding loop off the UI thread so
 * React rerenders, Radix animations, and WebSocket sends stay smooth
 * while streaming is live.
 */

importScripts('/lame.min.js')

let encoder = null
let pcmPort = null

self.onmessage = (e) => {
  const { type } = e.data

  if (type === 'init') {
    const { sampleRate, bitrate, port } = e.data
    encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate)
    pcmPort = port
    pcmPort.onmessage = (evt) => {
      if (!encoder) return
      const channelData = evt.data
      const len = channelData.length
      const samples = new Int16Array(len)
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]))
        samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      const mp3 = encoder.encodeBuffer(samples)
      if (mp3.length > 0) {
        const buf = new Uint8Array(mp3).buffer
        self.postMessage({ type: 'chunk', data: buf }, [buf])
      }
    }
    self.postMessage({ type: 'ready' })
    return
  }

  if (type === 'flush') {
    if (encoder) {
      const remaining = encoder.flush()
      if (remaining.length > 0) {
        const buf = new Uint8Array(remaining).buffer
        self.postMessage({ type: 'chunk', data: buf }, [buf])
      }
    }
    self.postMessage({ type: 'flushed' })
    return
  }
}
