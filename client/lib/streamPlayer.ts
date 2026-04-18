/**
 * Plays an Icecast Ogg/Opus stream via native <audio> element.
 * Browsers handle Ogg/Opus demuxing natively — no MSE needed.
 */
export class StreamPlayer {
  private audioEl: HTMLAudioElement | null = null
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
    this.audioEl.preload = "none"
    this.audioEl.src = streamUrl

    this.audioEl.onplaying = () => {
      this.onStateChange(true)
    }

    this.audioEl.onerror = () => {
      if (this.playing) {
        this.onError("Stream playback failed")
        this.stop()
      }
    }

    // Icecast may close the stream when the broadcaster stops
    this.audioEl.onended = () => {
      if (this.playing) this.stop()
    }

    try {
      await this.audioEl.play()
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        this.onError(err instanceof Error ? err.message : "Stream failed")
      }
      if (this.playing) this.stop()
    }
  }

  getAudioElement(): HTMLAudioElement | null {
    return this.audioEl
  }

  stop() {
    this.playing = false
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.removeAttribute("src")
      this.audioEl.load()
      this.audioEl.remove()
      this.audioEl = null
    }
    this.onStateChange(false)
  }

  isPlaying(): boolean {
    return this.playing
  }
}
