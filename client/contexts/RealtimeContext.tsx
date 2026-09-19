"use client"

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { getEcho, echoConnected } from "@/lib/echo"

/**
 * A station lifecycle signal, as it arrives from Laravel.
 *
 * A SIGNAL, not a status. It says which station changed and when — never what
 * the new state is. Consumers respond by refetching, so the container stays
 * the only thing that decides what is on air and there is no second copy of
 * StationStatusService::state() to keep in step here.
 *
 * `at` exists so a consumer can drop an event OLDER than what it has already
 * acted on — delivery is ordered per channel, but a reconnect can replay one
 * behind a poll that already landed. Whole seconds only, so it orders events
 * but cannot separate two inside the same second: a staleness test, never an
 * identity.
 */
export interface StationSignal {
  slug: string
  /** The container's own vocabulary: live_connected, icecast_disconnected, … */
  event: string
  /** ISO 8601 to the second, stamped when Laravel dispatched it. */
  at: string
}

interface Realtime {
  /**
   * Is the socket carrying messages right now?
   *
   * The ONLY thing consumers are allowed to change on the strength of this is
   * how often they poll. False must always mean "behave exactly as we did
   * before any of this existed".
   */
  connected: boolean
  /** Register for station signals. Returns its own unsubscribe. */
  onStationSignal: (handler: (signal: StationSignal) => void) => () => void
}

const RealtimeContext = createContext<Realtime | null>(null)

/**
 * Holds the app's one websocket and its one channel.
 *
 * ONE PRIVATE CHANNEL PER USER, carrying signals for every station this
 * account owns — not a channel per station. Ably's free tier caps concurrent
 * channels at 200 alongside its 200 connections, and per-station channels
 * would spend that ceiling several times faster for the same information.
 * `routes/channels.php` has the full reasoning and the note about revisiting
 * it on Reverb.
 *
 * Handlers are kept in a ref'd Set so a component mounting or unmounting
 * never resubscribes the channel — subscription churn on an Ably channel is
 * both slow and billable, and React remounts far more often than a user
 * changes account.
 */
export function RealtimeProvider({
  userId,
  children,
}: {
  userId: string | null
  children: React.ReactNode
}) {
  const [connected, setConnected] = useState(false)
  const handlers = useRef(new Set<(signal: StationSignal) => void>())

  const onStationSignal = useCallback((handler: (signal: StationSignal) => void) => {
    handlers.current.add(handler)
    return () => {
      handlers.current.delete(handler)
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const echo = getEcho()
    // No key configured — the kill switch. Leave `connected` false and every
    // consumer polls exactly as it did before.
    if (!echo) return

    const channel = echo.private(`user.${userId}`)

    channel.listen(".station.state", (signal: StationSignal) => {
      // Iterate a copy: a handler that unsubscribes itself while we are
      // dispatching would otherwise mutate the Set mid-loop.
      for (const handler of Array.from(handlers.current)) {
        handler(signal)
      }
    })

    // Track the connection rather than assuming it. Everything downstream
    // slows its polling while this is true, so a socket that dies without
    // saying so would quietly leave the dashboard updating every 30s instead
    // of every 10 — a worse failure than never having connected at all.
    //
    // "Connected" means the PRIVATE CHANNEL is subscribed, not merely that
    // the socket is open. The socket opens against Ably with nothing but the
    // public key; the subscription is what goes through /broadcasting/auth.
    // If that 401s (a cookie that did not ride along, the route off the api
    // stack again) the socket stays healthily connected and carries nothing —
    // and trusting it would slow the poll for a push that can never arrive.
    // pusher-js resubscribes every channel on reconnect, so `subscribed`
    // flips back on its own after a drop; it only has to be cleared here.
    const pusher = echo.connector?.pusher
    let subscribed = false
    const sync = () => setConnected(subscribed && echoConnected(echo))

    channel.subscribed(() => {
      subscribed = true
      sync()
    })
    channel.error(() => {
      subscribed = false
      sync()
    })

    const onStateChange = () => {
      if (!echoConnected(echo)) subscribed = false
      sync()
    }
    pusher?.connection?.bind("state_change", onStateChange)
    sync()

    return () => {
      pusher?.connection?.unbind("state_change", onStateChange)
      channel.stopListening(".station.state")
      // leaveChannel, NOT leave(): `leave()` also drops the public and
      // presence variants of the same name, and disconnect() would tear down
      // the shared socket that other providers may still be using.
      echo.leaveChannel(`private-user.${userId}`)
      setConnected(false)
    }
  }, [userId])

  const value = useMemo<Realtime>(
    () => ({ connected, onStationSignal }),
    [connected, onStationSignal],
  )

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

/**
 * Null outside the provider — on the public station page, the embed, or any
 * signed-out surface. Callers must treat that as "poll normally", which is
 * the same thing they do when the socket is down.
 */
export function useRealtime(): Realtime | null {
  return useContext(RealtimeContext)
}
