"use client"

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"

/**
 * Cloudflare Turnstile, the bot check on sign-up, sign-in and forgot password.
 *
 * `interaction-only`: the widget takes no space and shows nothing unless
 * Cloudflare wants a click from this visitor, so for almost everyone the form
 * looks exactly as it did. The token arrives through `onToken` a second or
 * two after mount; `token()` waits for it, for a submit that beats it.
 * Tokens are single-use: `reset()` after every request that sent one.
 *
 * Off (renders nothing, `token()` resolves null) without
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY, which pairs with TURNSTILE_SECRET_KEY on the
 * API.
 */

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

// How long a submit waits for a token before sending without one and letting
// the API answer (a blocked script, a challenge nobody clicks).
const TOKEN_WAIT_MS = 15_000

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string
  reset(id: string): void
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("turnstile script failed to load"))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  /** The current token, waiting for one if it hasn't arrived; null when off or it never came. */
  token(): Promise<string | null>
  /** After a failed submit: tokens are single-use, so fetch a fresh one. */
  reset(): void
}

/** `action` is the form's name in Cloudflare's analytics. */
export function Turnstile({ ref, action }: { ref: Ref<TurnstileHandle>; action: "register" | "login" | "forgot" }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const current = useRef<string | null>(null)
  const waiters = useRef<((token: string | null) => void)[]>([])
  // Out of the layout until Cloudflare asks for a click: an empty box in the
  // forms' flex column would still add a gap above the submit button.
  const [interactive, setInteractive] = useState(false)

  useImperativeHandle(ref, () => ({
    token() {
      if (!TURNSTILE_SITE_KEY) return Promise.resolve(null)
      if (current.current) return Promise.resolve(current.current)
      return new Promise((resolve) => {
        const done = (token: string | null) => {
          clearTimeout(timer)
          resolve(token)
        }
        const timer = setTimeout(() => {
          waiters.current = waiters.current.filter((w) => w !== done)
          resolve(null)
        }, TOKEN_WAIT_MS)
        waiters.current.push(done)
      })
    },
    reset() {
      current.current = null
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
    },
  }))

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false

    loadScript()
      .then((api) => {
        if (cancelled || !containerRef.current) return
        widgetId.current = api.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          size: "flexible",
          // The site is always dark; "auto" follows the OS and drew a white box.
          theme: "dark",
          action,
          callback: (token: string) => {
            current.current = token
            const pending = waiters.current
            waiters.current = []
            for (const resolve of pending) resolve(token)
          },
          "before-interactive-callback": () => setInteractive(true),
          "expired-callback": () => {
            current.current = null
          },
          "error-callback": () => {
            // Turnstile retries on its own, but a submit waiting now gets no
            // token rather than hanging; the API's refusal says try again.
            // (110200 here is a hostname missing from the widget's list.)
            current.current = null
            const pending = waiters.current
            waiters.current = []
            for (const resolve of pending) resolve(null)
          },
        })
      })
      .catch(() => {
        // Script blocked or offline. The submit sends no token after its wait
        // and the API's error is shown like any other.
      })

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [action])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={containerRef} className={interactive ? undefined : "pointer-events-none absolute size-0 overflow-hidden"} />
}
