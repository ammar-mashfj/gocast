"use client"

import { useEffect, useRef } from "react"

/**
 * For a client page that seeds its state from server props and then edits it
 * in place (Library, Playlists, Jingles): fetch its data again when the page
 * comes back through the browser's back or forward button.
 *
 * Next reuses a page's cached payload on back/forward, so the page re-seeds
 * from the props it first loaded with — a track deleted before leaving is
 * listed again, and deleting it a second time fails. A page reached any other
 * way was just rendered by the server, and its props are current.
 */
let lastHistoryNav = 0
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastHistoryNav = Date.now()
  })
}

/** How soon after a back/forward a mount counts as that navigation's. */
const HISTORY_MOUNT_WINDOW_MS = 3000

export function useResyncOnHistoryNav(resync: () => void) {
  const resyncRef = useRef(resync)
  useEffect(() => {
    resyncRef.current = resync
  })

  useEffect(() => {
    if (Date.now() - lastHistoryNav < HISTORY_MOUNT_WINDOW_MS) resyncRef.current()
  }, [])
}
