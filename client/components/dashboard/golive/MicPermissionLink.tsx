"use client"

import { useSyncExternalStore } from "react"
import { Button } from "@/components/ds/Button"

/**
 * "How to allow it", pointing at the browser vendor's own page for site
 * microphone permissions — the steps differ per browser and change with its
 * versions, so they're not rewritten here. Edge, Brave, Opera and the rest of
 * Chromium share Chrome's settings, so they get Chrome's page.
 */
const HELP = {
  firefox: "https://support.mozilla.org/en-US/kb/how-manage-your-camera-and-microphone-permissions",
  safari: "https://support.apple.com/guide/safari/customize-settings-per-website-ibrw7f78f7fe/mac",
  chrome: "https://support.google.com/chrome/answer/2693767",
}

function helpUrl(): string {
  const ua = navigator.userAgent
  if (/firefox|fxios/i.test(ua)) return HELP.firefox
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg/i.test(ua)) return HELP.safari
  return HELP.chrome
}

const noop = () => () => {}

/** The last of a Mic blocked notice's actions. */
export function MicPermissionLink({
  variant = "quiet",
  size = "lg",
  className,
}: {
  /** "inline": a small underlined text link, for a one-line row. */
  variant?: "quiet" | "ghost" | "inline"
  size?: "sm" | "lg"
  className?: string
}) {
  const href = useSyncExternalStore(noop, helpUrl, () => HELP.chrome)
  if (variant === "inline") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? "w-fit text-caption underline underline-offset-2 opacity-80 hover:opacity-100"}>
        How to allow it ↗
      </a>
    )
  }
  return (
    <Button size={size} variant={variant} className={className} asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">How to allow it ↗</a>
    </Button>
  )
}
