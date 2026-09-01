"use client"

import { useEffect, useRef } from "react"
import { env } from "@/lib/env"

/**
 * Reports this browser as a listener for as long as audio is actually playing.
 *
 * WHY THE PLAYER REPORTS INSTEAD OF THE SERVER COUNTING. Icecast can count its
 * own listeners because each one holds a socket open. HLS cannot — a player
 * fetches a manifest and some segments and walks away, over and over, and
 * nobody ever hangs up. The audience has to be given an identity and then
 * observed, and doing that from here rather than from server access logs buys
 * three things: it needs no log tailer running outside the app, it knows the
 * difference between PLAYING and merely paused with the tab open, and it keeps
 * the API out of the audio path — so if this endpoint is down, the stream
 * keeps playing and all that is lost is a statistic.
 *
 * It is deliberately transport-agnostic. Nothing here knows or cares whether
 * the audio arrived over Icecast or HLS, so the switch between them changes
 * nothing in this file.
 *
 * Failure is always silent. A listener must never see an error, or lose audio,
 * because analytics did not work.
 */
export function useListenerSession(
  slug: string,
  playing: boolean,
  transport: "hls" | "icecast" | null,
): void {
  // Held in a ref rather than state: nothing renders from it, and a re-render
  // on every check-in would be a re-render every fifteen seconds for the
  // entire time someone is listening.
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    // Both conditions matter. `playing` keeps a paused tab out of the count,
    // and waiting for a resolved transport keeps the server from having to
    // guess: an Icecast listener is already inside the number the admin poll
    // returns, so reporting them as HLS would count the same person twice.
    if (!playing || !transport) return

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    /**
     * `keepalive` matters more than it looks: without it a check-in fired as
     * the tab closes is cancelled with the document, and the last thing we
     * would learn about a listener is that they stopped — a minute before they
     * actually did.
     */
    function post(path: string): Promise<Response | void> {
      return fetch(`${env.apiUrl}/public${path}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        keepalive: true,
      }).catch(() => {})
    }

    async function open() {
      try {
        const res = await fetch(`${env.apiUrl}/public/stations/${slug}/listen`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ transport }),
        })
        if (!res.ok || cancelled) return

        const body = await res.json()
        const token = body?.data?.token
        if (!token || cancelled) return

        tokenRef.current = token

        // The interval comes from the server so the cadence stays tied to the
        // window the backend counts listeners over. Hard-coding it here means
        // one of the two can be changed without the other, and every listener
        // silently expires between their own check-ins.
        const seconds = Number(body?.data?.beat_every) || 15
        timer = setInterval(() => {
          if (tokenRef.current) post(`/listen/${tokenRef.current}/beat`)
        }, seconds * 1000)
      } catch {
        // No session, no stats, no problem the listener can see.
      }
    }

    function close() {
      const token = tokenRef.current
      if (!token) return
      tokenRef.current = null

      // sendBeacon is the only thing that reliably survives a page being
      // destroyed — a normal fetch from `unload` is cancelled. It is fire and
      // forget, so the endpoint answers 204 to a duplicate rather than an
      // error nobody could read anyway.
      const url = `${env.apiUrl}/public/listen/${token}/end`
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url)
      } else {
        post(`/listen/${token}/end`)
      }
    }

    open()

    // `pagehide` rather than `unload`: it is the event that actually fires on
    // mobile Safari, and it also fires when a page enters the back/forward
    // cache, which is a listener leaving as far as anyone is concerned.
    window.addEventListener("pagehide", close)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      window.removeEventListener("pagehide", close)
      close()
    }
  }, [slug, playing, transport])
}
