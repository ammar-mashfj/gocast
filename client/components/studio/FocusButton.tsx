"use client"

import { useEffect, useState } from "react"
import { IconMaximize, IconMinimize } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { cn } from "@/lib/utils"

const ATTR = "data-studio-focus"

/**
 * Focus mode: the studio alone on the screen. Full-screens the whole page,
 * not the studio element, so the dialogs and toasts (portalled to <body>)
 * still show; the sidebar and top bar are hidden by `html[data-studio-focus]`
 * (app/dashboard.css). The LIVE band stays: its warnings still matter.
 *
 * Desktop only for now. Esc (the browser's own exit) or the same button
 * leaves it; so does leaving the studio. Where full screen is refused, the
 * chrome is still hidden.
 */
export function FocusButton({ className }: { className?: string }) {
  const [on, setOn] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (on) root.setAttribute(ATTR, "")
    else root.removeAttribute(ATTR)
  }, [on])

  // Esc exits full screen without asking us: follow it out. So does the
  // browser opening a file chooser (Add files) — a page can't take full
  // screen back without a fresh click, so focus mode simply ends there and
  // the host presses Focus mode again if they want it.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setOn(false)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Leaving the studio leaves focus mode.
  useEffect(
    () => () => {
      document.documentElement.removeAttribute(ATTR)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    },
    [],
  )

  function toggle() {
    if (on) {
      setOn(false)
      const exit = () => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      }
      exit()
      return
    }
    setOn(true)
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <Button
      variant="quiet"
      onClick={toggle}
      aria-pressed={on}
      title={on ? "Back to the dashboard (Esc)" : "Full screen, the studio only"}
      className={cn("h-13 gap-2 rounded-button bg-card px-4.5 text-foreground hover:bg-card/80", className)}
    >
      {on ? <IconMinimize className="size-5" /> : <IconMaximize className="size-5" />}
      {on ? "Exit focus mode" : "Focus mode"}
    </Button>
  )
}
