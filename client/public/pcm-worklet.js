/**
 * Captures the mixed PCM output and forwards it to the encoder Worker
 * via a MessagePort installed at init time. No encoding happens here;
 * this runs in the realtime audio thread.
 *
 * Batches 128-sample process() chunks into larger posts (BATCH_SAMPLES)
 * to cut postMessage frequency from ~344/sec to ~11/sec. Adds ~93ms of
 * buffering — negligible compared to Icecast's listener-side latency.
 *
 * Stereo: both channels are batched and posted together. A mono source
 * (a mic, typically) presents one channel, which is duplicated so the
 * encoder always receives a matched pair and the listener hears centred
 * audio rather than sound in one ear.
 */
const BATCH_SAMPLES = 4096 // 32 × 128 samples ≈ 92.9ms at 44.1kHz

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.encoderPort = null
    this.left = new Float32Array(BATCH_SAMPLES)
    this.right = new Float32Array(BATCH_SAMPLES)
    this.offset = 0
    this.port.onmessage = (e) => {
      if (e.data?.type === 'init') {
        this.encoderPort = e.data.port
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0] || input[0].length === 0) return true
    if (!this.encoderPort) return true

    const left = input[0]
    // Mono sources expose a single channel — feed it to both sides.
    const right = input[1] || input[0]
    const len = left.length

    let consumed = 0
    while (consumed < len) {
      const space = BATCH_SAMPLES - this.offset
      const take = Math.min(space, len - consumed)

      this.left.set(left.subarray(consumed, consumed + take), this.offset)
      this.right.set(right.subarray(consumed, consumed + take), this.offset)
      this.offset += take
      consumed += take

      if (this.offset === BATCH_SAMPLES) this.flush()
    }

    return true
  }

  flush() {
    // Both buffers are transferred — allocate fresh ones for the next window.
    this.encoderPort.postMessage({ left: this.left, right: this.right }, [
      this.left.buffer,
      this.right.buffer,
    ])
    this.left = new Float32Array(BATCH_SAMPLES)
    this.right = new Float32Array(BATCH_SAMPLES)
    this.offset = 0
  }
}

registerProcessor('pcm-processor', PCMProcessor)
