"use client"

import { useEffect, useRef } from "react"
import { SidebarInset } from "@/components/ui/sidebar"
import { TopBar } from "./TopBar"
import { StationBand } from "./StationBand"
import { TabBar } from "./TabBar"

/**
 * Everything right of the sidebar: the sticky chrome (top bar + status band)
 * and the page body.
 *
 * The body is padded to the page gutter and capped at `max-w-page`.
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
      <div className="flex-1 px-gutter pt-8 pb-30">
        <div className="mx-auto w-full max-w-page">{children}</div>
      </div>
      <TabBar />
    </SidebarInset>
  )
}
