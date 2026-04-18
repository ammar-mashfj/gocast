/**
 * Captures the mixed PCM output and forwards it to the encoder Worker
 * via a MessagePort installed at init time. No encoding happens here;
 * this runs in the realtime audio thread.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.encoderPort = null
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
    // process() reuses the input buffer across calls — copy before posting.
    const copy = new Float32Array(input[0])
    this.encoderPort.postMessage(copy, [copy.buffer])
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
