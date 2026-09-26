"use client"

import { useEffect, useState } from "react"

/**
 * True when the primary pointer is a finger. The studio's copy names keys —
 * "hold Space", "press K" — which a host on a phone or tablet does not have;
 * this is what switches that copy to the controls they can actually touch.
 * False on the server and until mounted, so the keyboard wording is the
 * default a desktop never sees change.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const sync = () => setCoarse(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return coarse
}
