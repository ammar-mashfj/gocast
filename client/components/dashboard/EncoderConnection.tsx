"use client"

import { useState } from "react"
import { toast } from "sonner"
import { copyText } from "@/lib/clipboard"
import { Button } from "@/components/ds/Button"
import Link from "next/link"
import { IconExternalLink } from "@tabler/icons-react"
import { StationEncoder } from "@/interfaces/Station"

interface EncoderConnectionProps {
  encoder: StationEncoder
  /**
   * The key to display, already resolved by the caller.
   *
   * Not read off `encoder.password` here, because the settings card has a
   * newer answer than its own props for a moment after a rotation — see the
   * `rotated` override in EncoderCard. Null renders the unreadable-key state.
   */
  password: string | null
  /**
   * Reveal state is CONTROLLED, and that is not ceremony. The settings card
   * has to force it true the instant a rotation lands: the only reason anyone
   * presses "New key" is to go and paste the new one, and a fresh key behind
   * a row of dots is a click nobody should have to make.
   */
  revealed: boolean
  onToggleReveal: () => void
}

/**
 * The five values a DJ types into BUTT, Mixxx or RadioDJ, and a link to the
 * help article's per-app steps (where each one goes).
 *
 * Shown by EncoderPanel on Station settings (the only place the key can be
 * rotated) and on the go-live page's "Use DJ software instead".
 *
 * Presentational only — no fetching, no rotation, no plan check. Every caller
 * has already decided this account may see a credential.
 */
export function EncoderConnection({
  encoder,
  password,
  revealed,
  onToggleReveal,
}: EncoderConnectionProps) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(label: string, value: string) {
    // The values now show in full, so a failed copy can point at them.
    if (await copyText(value)) {
      setCopied(label)
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600)
    } else {
      toast.error("Couldn't copy — select the value and copy it manually")
    }
  }

  const unreadableKey = password === null

  const fields: Array<{ label: string; value: string; secret?: boolean; hint?: string; noCopy?: boolean }> = [
    // Something to pick in the software, not paste, so no Copy. "Type", not
    // "Connection type": the label column is 80px.
    { label: "Type", value: "Icecast 2", noCopy: true },
    { label: "Server", value: encoder.host },
    { label: "Port", value: String(encoder.port) },
    { label: "Mount", value: encoder.mount, hint: "Some encoders call this the mountpoint or path." },
    { label: "Username", value: encoder.username },
    {
      label: "Password",
      value: password ?? "Unavailable",
      // Nothing to reveal or usefully copy when there is no key, and a masked
      // row of dots would claim there is one.
      secret: !unreadableKey,
      hint: unreadableKey
        ? "This server can no longer read your stream key. Choose New key to mint a working one."
        : "Also called the stream key or source password.",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-1.5">
        {fields.map((field) => {
          const hidden = field.secret && !revealed
          const copyable = !field.noCopy && !(unreadableKey && field.label === "Password")
          return (
            <div key={field.label} className="flex flex-col gap-1 rounded-control bg-surface-inset px-3.5 py-2.5">
              {/* min-h: the Copy button's height, so a row without one lines up. */}
              <div className="flex min-h-8.5 items-center gap-3">
                <dt className="w-20 shrink-0 eyebrow-sm text-text-faint">{field.label}</dt>
                <dd className="min-w-0 flex-1 font-mono text-body-sm break-all text-foreground">
                  {hidden ? "•".repeat(16) : field.value}
                </dd>
                {field.secret && (
                  <Button size="sm" variant="quiet" onClick={onToggleReveal} aria-label={revealed ? "Hide stream key" : "Show stream key"}>
                    {revealed ? "Hide" : "Show"}
                  </Button>
                )}
                {copyable && (
                  <Button size="sm" variant="subtle" onClick={() => copy(field.label, field.value)} aria-label={`Copy ${field.label.toLowerCase()}`}>
                    {copied === field.label ? "Copied" : "Copy"}
                  </Button>
                )}
              </div>
              {field.hint && <p className="text-caption text-text-faint sm:pl-23">{field.hint}</p>}
            </div>
          )
        })}
      </dl>

    </div>
  )
}

/**
 * The per-app steps (BUTT, Mixxx, ffmpeg) are in the help article, opened in
 * a new tab. It's the subtitle of both DJ-software dialogs (Settings, Go
 * live): the first thing someone stuck reads, and not a row under the values.
 */
export function HowToConnectLink() {
  return (
    <Link
      href="/help/broadcast-from-butt-or-mixxx#where-these-go"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
    >
      How to connect
      <IconExternalLink aria-hidden className="size-4" />
    </Link>
  )
}
