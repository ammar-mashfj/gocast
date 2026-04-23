"use client"

import { useEffect, useRef } from "react"

/**
 * Set document.title to the given string for as long as this hook is mounted
 * with a truthy value. Restores the previous title on unmount or when title
 * becomes null/empty.
 *
 * Used to show live broadcast / playback status in the browser tab — multi-tab
 * users rely on the tab strip to find the right tab.
 */
export function useDocumentTitle(title: string | null) {
  const previousRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof document === "undefined") return
    if (previousRef.current === null) {
      previousRef.current = document.title
    }
    if (title) {
      document.title = title
    } else if (previousRef.current) {
      document.title = previousRef.current
    }
    return () => {
      if (previousRef.current) {
        document.title = previousRef.current
      }
    }
  }, [title])
}
