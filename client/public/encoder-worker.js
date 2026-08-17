/**
 * Off-main-thread MP3 encoder.
 *
 * Receives stereo Float32Array PCM from the AudioWorklet via a MessagePort
 * and emits encoded MP3 frames back to the main thread, which forwards them
 * as binary webcast frames to Liquidsoap's harbor input.
 *
 * Keeps lamejs and the per-chunk encoding loop off the UI thread so React
 * rerenders, Radix animations, and WebSocket sends stay smooth while
 * streaming is live.
 *
 * MP3 rather than Opus because the webcast protocol's documented format is
 * `audio/mpeg` / `libmp3lame`, and harbor passes the binary frames straight
 * through to its decoder. lamejs *is* LAME, so this satisfies it exactly.
 */

importScripts('/lame.min.js')

const CHANNELS = 2

let encoder = null
let pcmPort = null

/** Float32 [-1,1] → Int16, which is what lamejs expects. */
function toInt16(channel) {
  const len = channel.length
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function emit(mp3) {
  if (mp3.length > 0) {
    const buf = new Uint8Array(mp3).buffer
    self.postMessage({ type: 'chunk', data: buf }, [buf])
  }
}

self.onmessage = (e) => {
  const { type } = e.data

  if (type === 'init') {
    const { sampleRate, bitrate, port } = e.data
    encoder = new lamejs.Mp3Encoder(CHANNELS, sampleRate, bitrate)
    pcmPort = port
    pcmPort.onmessage = (evt) => {
      if (!encoder) return
      const { left, right } = evt.data
      emit(encoder.encodeBuffer(toInt16(left), toInt16(right)))
    }
    self.postMessage({ type: 'ready' })
    return
  }

  if (type === 'flush') {
    if (encoder) {
      emit(encoder.flush())
    }
    self.postMessage({ type: 'flushed' })
    return
  }
}
