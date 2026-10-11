"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { copyText } from "@/lib/clipboard"
import { Button } from "./Button"

/**
 * A value to hand to someone else — your station link, a stream URL — in a
 * well, with Copy beside it. The value is mono and truncates; the button
 * says "Copied" for a moment, and a screen reader hears it.
 *
 * When no way of copying works, the well shows the whole value, selected, so
 * it can be copied by hand: what is on screen is often shortened (no scheme,
 * no tracking tag), and copying that would hand out the wrong link.
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
  const manualRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  // Selected as soon as it appears, ready for the long-press or Ctrl+C.
  useEffect(() => {
    if (failed) manualRef.current?.select()
  }, [failed])

  async function copy() {
    const ok = await copyText(value)
    setCopied(ok)
    setFailed(!ok)
    if (timer.current) clearTimeout(timer.current)
    if (ok) timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-button bg-surface-inset py-1.5 pr-1.5 pl-4", className)}>
      {failed ? (
        <input
          ref={manualRef}
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-body outline-none"
        />
      ) : (
        <span aria-label={label} className="min-w-0 flex-1 truncate font-mono text-body">
          {display ?? value}
        </span>
      )}
      <Button size="md" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? "Copied" : failed ? "Copy it yourself" : "Copy"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : failed ? `Couldn’t copy. The full ${label.toLowerCase()} is selected for you to copy.` : ""}
      </span>
    </div>
  )
}
