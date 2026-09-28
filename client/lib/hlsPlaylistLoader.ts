import type Hls from "hls.js"
import type { LoaderCallbacks, LoaderConfiguration, LoaderContext, PlaylistLoaderConstructor } from "hls.js"

/**
 * hls.js's own playlist loader, except that a response arriving *inside*
 * `xhr.send()` is handed on from a fresh stack instead of the current one.
 *
 * iOS Safari does this after the phone wakes (Sentry 150012400). The overdue
 * reload's response is delivered synchronously from `send()`, and hls.js 1.7
 * cannot take that. Its LevelController gets LEVEL_LOADED first and requests
 * the next reload while still in the same call. The StreamController has not
 * yet stored the new playlist, so that next response is compared against the
 * playlist from before the sleep. It looks just as overdue, fires again at
 * once, and the loop runs until the stack overflows. In the report that was
 * ~80 playlist requests within 85ms. Reproduced in Chromium with a sync XHR
 * and a 22-minute clock jump: 241 nested requests, 4,812 frames deep.
 *
 * Deferring by one task lets every LEVEL_LOADED handler finish before the
 * next reload is scheduled, so the usual timer-based reload takes over.
 * Responses that arrive asynchronously, which is almost all of them, go
 * through untouched.
 */
export function createPlaylistLoader(HlsCtor: typeof Hls): PlaylistLoaderConstructor {
  const Base = HlsCtor.DefaultConfig.loader

  class DeferredPlaylistLoader extends Base {
    private sending = false
    // Bumped by every load, abort and destroy, so a deferred callback from
    // a request that has since been replaced or cancelled never fires.
    private generation = 0

    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>,
    ) {
      const generation = ++this.generation
      const defer = <A extends unknown[]>(fn: ((...args: A) => void) | undefined) =>
        fn &&
        ((...args: A) => {
          if (!this.sending) return fn(...args)
          setTimeout(() => {
            if (this.generation === generation) fn(...args)
          })
        })

      this.sending = true
      try {
        super.load(context, config, {
          ...callbacks,
          onSuccess: defer(callbacks.onSuccess)!,
          onError: defer(callbacks.onError)!,
        })
      } finally {
        this.sending = false
      }
    }

    abort() {
      this.generation++
      super.abort()
    }

    destroy() {
      this.generation++
      super.destroy()
    }
  }

  // DefaultConfig.loader is typed for any context; hls.js only hands this
  // playlist contexts, which is what pLoader promises.
  return DeferredPlaylistLoader as unknown as PlaylistLoaderConstructor
}
