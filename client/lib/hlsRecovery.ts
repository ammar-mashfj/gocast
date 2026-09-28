import type Hls from "hls.js"

/** Fatal network errors in a row before we stop retrying HLS. */
const MAX_ATTEMPTS = 5

/**
 * Retry for fatal hls.js network errors, spaced out and capped.
 *
 * Calling `hls.startLoad()` straight from the ERROR handler caused a stack
 * overflow on iOS Safari (Sentry 150012400). `startLoad` goes on to
 * `xhr.send()` in the same call stack. When the network drops, WebKit can
 * fail that XHR synchronously, inside `send()`. hls.js has already used up
 * its own retries by then, so the error comes back fatal and the handler
 * calls `startLoad` again, still in the same stack. Nothing breaks the chain,
 * so it recurses until the stack runs out.
 *
 * A timer ends the recursion, and the backoff stops a dead mount from being
 * hit as fast as the phone can send requests. Every playlist that loads
 * resets the count, so short outages spread over a long listen never add up
 * to the cap. `giveUp` runs once the retries are used up.
 *
 * The constructor comes in as a parameter so the embed player can keep
 * loading hls.js only when someone presses play.
 */
export function createNetworkRecovery(hls: Hls, HlsCtor: typeof Hls, giveUp: () => void) {
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  hls.on(HlsCtor.Events.LEVEL_LOADED, () => {
    attempts = 0
  })
  hls.on(HlsCtor.Events.DESTROYING, () => clearTimeout(timer))

  return function retry() {
    clearTimeout(timer)
    if (attempts >= MAX_ATTEMPTS) {
      giveUp()
      return
    }
    const delay = 1000 * 2 ** attempts
    attempts++
    timer = setTimeout(() => hls.startLoad(), delay)
  }
}
