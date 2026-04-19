/**
 * Captures the mixed PCM output and forwards it to the encoder Worker
 * via a MessagePort installed at init time. No encoding happens here;
 * this runs in the realtime audio thread.
 *
 * Batches 128-sample process() chunks into larger posts (BATCH_SAMPLES)
 * to cut postMessage frequency from ~344/sec to ~11/sec. Adds ~93ms of
 * buffering — negligible compared to Icecast's listener-side latency.
 */
const BATCH_SAMPLES = 4096 // 32 × 128 samples ≈ 92.9ms at 44.1kHz

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.encoderPort = null
    this.batch = new Float32Array(BATCH_SAMPLES)
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

    const samples = input[0]
    const len = samples.length

    // Fast path: the process quantum fits in the remaining batch space.
    if (this.offset + len <= BATCH_SAMPLES) {
      this.batch.set(samples, this.offset)
      this.offset += len
      if (this.offset === BATCH_SAMPLES) this.flush()
      return true
    }

    // Slow path: spans a batch boundary. Fill, flush, then start a new batch
    // with the remainder. Only runs if BATCH_SAMPLES isn't a multiple of the
    // process quantum (128) — with the default 4096 it never does, but keep
    // the logic defensive in case BATCH_SAMPLES is tuned later.
    const firstPart = BATCH_SAMPLES - this.offset
    this.batch.set(samples.subarray(0, firstPart), this.offset)
    this.offset = BATCH_SAMPLES
    this.flush()
    this.batch.set(samples.subarray(firstPart), 0)
    this.offset = len - firstPart
    return true
  }

  flush() {
    // `batch` is transferred — allocate a fresh one for the next window.
    this.encoderPort.postMessage(this.batch, [this.batch.buffer])
    this.batch = new Float32Array(BATCH_SAMPLES)
    this.offset = 0
  }
}

registerProcessor('pcm-processor', PCMProcessor)
