"use client"

import { useEffect, useRef, useState } from "react"
import { copyText } from "@/lib/clipboard"
import { Button } from "@/components/ds/Button"

/**
 * One address in "Where listeners find you": the label with Copy (and Open)
 * beside it, then the address as plain text that wraps. Not CopyField: a
 * filled well read as an input to type in, and its one truncated line cut
 * off the end of the address on a phone, the part that tells stations apart.
 *
 * When copying fails the whole address (with its scheme) appears selected,
 * as in CopyField, so it can be copied by hand.
 */
export function StreamLink({
  label,
  value,
  note,
  open = false,
}: {
  label: string
  value: string
  note: string
  /** Offer Open ↗: worth it for a page, not for a raw audio stream. */
  open?: boolean
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    const ok = await copyText(value)
    setState(ok ? "copied" : "failed")
    if (timer.current) clearTimeout(timer.current)
    if (ok) timer.current = setTimeout(() => setState("idle"), 1800)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="eyebrow min-w-0 flex-1 text-text-faint">{label}</span>
        <Button size="sm" variant="subtle" onClick={copy} aria-label={`Copy ${label.toLowerCase()} address`}>
          {state === "copied" ? "Copied" : state === "failed" ? "Copy it yourself" : "Copy"}
        </Button>
        {open && (
          <Button size="sm" variant="ghost" asChild>
            <a href={value} target="_blank" rel="noopener noreferrer">Open ↗</a>
          </Button>
        )}
      </div>
      {state === "failed" ? (
        <input
          ref={(el) => el?.select()}
          readOnly
          value={value}
          aria-label={`${label} address`}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded-control bg-surface-inset px-3 py-2 font-mono text-body-sm outline-none"
        />
      ) : (
        // break-all: an address has no spaces to wrap at, so it would
        // otherwise overflow the card on a phone instead of wrapping.
        <span className="font-mono text-body break-all">{value.replace(/^https?:\/\//, "")}</span>
      )}
      <span className="text-body-sm text-text-faint">{note}</span>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? `${label} address copied` : state === "failed" ? `Couldn’t copy. The full ${label.toLowerCase()} address is selected for you to copy.` : ""}
      </span>
    </div>
  )
}
