"use client"

import { useEffect, useRef } from "react"
import { SidebarInset } from "@/components/ui/sidebar"
import { TopBar } from "./TopBar"
import { StationBand } from "./StationBand"
// TabBar (./TabBar) is off for now: the sidebar is always there. Kept to bring back.

/**
 * Everything right of the sidebar: the sticky chrome (top bar + status band)
 * and the page body.
 *
 * The body is padded to the page gutter and capped at `max-w-page`. The deep
 * bottom padding is room for the tab bar and goes with it (lg:hidden — phones
 * and tablets get the tab bar; the sidebar takes over from lg).
 *
 * The chrome's height changes with the band (its message wraps on narrow
 * screens), so it is measured and published as `--chrome-h` on <html>, for
 * scroll-padding: an anchored section isn't scrolled under the chrome.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const chrome = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = chrome.current
    if (!el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty("--chrome-h", `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--chrome-h")
    }
  }, [])

  return (
    <SidebarInset>
      <div ref={chrome} className="sticky top-0 z-20 bg-background">
        <TopBar />
        <StationBand />
      </div>
      <div className="flex-1 px-gutter pt-5 pb-5">
        <div data-slot="page-frame" className="mx-auto w-full max-w-page">{children}</div>
      </div>
    </SidebarInset>
  )
}
