/**
 * Plays an Icecast MP3 stream via fetch() + MediaSource Extensions.
 * Falls back to blob-based playback if MSE doesn't support audio/mpeg.
 * Starts playback as soon as the first chunk is buffered — near-instant.
 */
export class StreamPlayer {
  private audioEl: HTMLAudioElement | null = null
  private mediaSource: MediaSource | null = null
  private sourceBuffer: SourceBuffer | null = null
  private abortController: AbortController | null = null
  private playing = false
  private onStateChange: (playing: boolean) => void
  private onError: (message: string) => void

  constructor(callbacks: {
    onStateChange: (playing: boolean) => void
    onError: (message: string) => void
  }) {
    this.onStateChange = callbacks.onStateChange
    this.onError = callbacks.onError
  }

  async play(streamUrl: string): Promise<void> {
    if (this.playing) return
    this.playing = true

    if (this.audioEl) this.audioEl.remove()
    this.audioEl = document.createElement("audio")

    this.abortController = new AbortController()

    try {
      const response = await fetch(streamUrl, { signal: this.abortController.signal })
      if (!response.ok) throw new Error("HTTP " + response.status)

      const mseSupported = MediaSource.isTypeSupported("audio/mpeg")
      if (mseSupported) {
        await this.playWithMSE(response)
      } else {
        await this.playWithBlob(response)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Normal stop
      } else {
        this.onError(err instanceof Error ? err.message : "Stream failed")
      }
    }

    if (this.playing) this.stop()
  }

  private async playWithMSE(response: Response): Promise<void> {
    this.mediaSource = new MediaSource()
    this.audioEl!.src = URL.createObjectURL(this.mediaSource)

    await new Promise<void>((resolve) => {
      this.mediaSource!.addEventListener("sourceopen", () => resolve(), { once: true })
    })

    this.sourceBuffer = this.mediaSource.addSourceBuffer("audio/mpeg")
    const reader = response.body!.getReader()
    let started = false
    const queue: Uint8Array[] = []
    let appending = false

    const appendNext = (): void => {
      if (appending || queue.length === 0) return
      if (this.sourceBuffer!.updating) return
      appending = true
      const chunk = queue.shift()!
      try {
        this.sourceBuffer!.appendBuffer(chunk.buffer as ArrayBuffer)
      } catch {
        appending = false
      }
    }

    this.sourceBuffer.addEventListener("updateend", () => {
      appending = false

      // Start playback as soon as we have some data buffered
      if (!started && this.audioEl!.buffered.length > 0) {
        this.audioEl!.play()
        started = true
        this.onStateChange(true)
      }

      appendNext()
    })

    while (this.playing) {
      const { done, value } = await reader.read()
      if (done) break
      queue.push(value)
      appendNext()
    }
  }

  private async playWithBlob(response: Response): Promise<void> {
    const reader = response.body!.getReader()
    const chunks: Uint8Array[] = []
    let totalSize = 0

    while (this.playing) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalSize += value.length

      if (!this.audioEl!.src && totalSize >= 32000) {
        const blob = new Blob(chunks, { type: "audio/mpeg" })
        this.audioEl!.src = URL.createObjectURL(blob)
        this.audioEl!.play()
        this.onStateChange(true)
      }
    }
  }

  getAudioElement(): HTMLAudioElement | null {
    return this.audioEl
  }

  stop() {
    this.playing = false
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.audioEl) {
      this.audioEl.pause()
      if (this.audioEl.src) URL.revokeObjectURL(this.audioEl.src)
      this.audioEl.remove()
      this.audioEl = null
    }
    if (this.mediaSource && this.mediaSource.readyState === "open") {
      try { this.mediaSource.endOfStream() } catch { /* already ended */ }
    }
    this.mediaSource = null
    this.sourceBuffer = null
    this.onStateChange(false)
  }

  isPlaying(): boolean {
    return this.playing
  }
}
