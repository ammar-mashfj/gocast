"use client"

import { useSyncExternalStore } from "react"

const subscribeToNothing = () => () => {}
const onClient = () => true
const onServer = () => false

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * For values that only exist in a browser — the viewer's timezone, their
 * locale's clock format — where rendering the server's answer and then the
 * browser's is a hydration mismatch. useSyncExternalStore is the form that
 * says this without a state write inside an effect: it takes a server
 * snapshot and a client snapshot, which is exactly the distinction being
 * drawn, and React swaps from one to the other after hydration.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribeToNothing, onClient, onServer)
}
