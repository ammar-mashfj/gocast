"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "./Button"

/**
 * A value to hand to someone else — your station link, a stream URL — in a
 * well, with Copy beside it. The value is mono and truncates; the button
 * says "Copied" for a moment, and a screen reader hears it.
 */
export function CopyField({
  value,
  display,
  label,
  className,
}: {
  value: string
  /** What to show, when it differs from what is copied (no scheme, say). */
  display?: string
  /** Names the value for assistive tech: "Station link". */
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setFailed(false)
      setCopied(true)
    } catch {
      // Clipboard blocked (permissions, an insecure origin): say so rather
      // than claim a copy that didn't happen.
      setFailed(true)
      setCopied(false)
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, 1800)
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-button bg-surface-inset py-1.5 pr-1.5 pl-4", className)}>
      <span aria-label={label} className="min-w-0 flex-1 truncate font-mono text-body">
        {display ?? value}
      </span>
      <Button size="md" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? "Copied" : failed ? "Couldn’t copy" : "Copy"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : failed ? "Couldn’t copy" : ""}
      </span>
    </div>
  )
}
