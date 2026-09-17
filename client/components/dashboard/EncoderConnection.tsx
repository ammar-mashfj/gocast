"use client"

import { useState } from "react"
import { toast } from "sonner"
import { IconCheck, IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
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
 * The five values a DJ types into BUTT, Mixxx or RadioDJ, plus where each one
 * goes in the software people actually use.
 *
 * Shared by the two places that show them: the settings card, which is the
 * canonical home and the only place the key can be rotated, and the go-live
 * dialog, which is where somebody is standing when they DECIDE to broadcast
 * this way. Duplicating the values across those two would guarantee they
 * eventually disagree, and a wrong port here is a support ticket that reads
 * exactly like a wrong password.
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
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600)
    } catch {
      toast.error("Couldn't copy — select the value and copy it manually")
    }
  }

  const unreadableKey = password === null

  const fields: Array<{ label: string; value: string; secret?: boolean; hint?: string }> = [
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

  // Where the five values above go in the software people actually use. The
  // labels differ enough between clients that "Server / Port / Mount" is not
  // self-evident: BUTT calls the key a password, Mixxx calls it a login, and
  // Mixxx's Server field wants the hostname WITHOUT a scheme, which is the
  // single most common way a first connection fails.
  const clients: Array<{ name: string; steps: string[] }> = [
    {
      name: "BUTT",
      steps: [
        "Settings → Main → Server → Add",
        "Type: Icecast",
        `Address: ${encoder.host}   Port: ${encoder.port}`,
        `Mountpoint: ${encoder.mount.replace(/^\//, "")}   (BUTT adds the slash itself)`,
        "User: source   Password: your stream key",
      ],
    },
    {
      name: "Mixxx",
      steps: [
        "Preferences → Live Broadcasting → Server connection",
        "Type: Icecast 2",
        `Host: ${encoder.host}   Port: ${encoder.port}   (host only — no http:// )`,
        `Mount: ${encoder.mount}`,
        "Login: source   Password: your stream key",
        "Then Options → Enable Live Broadcasting to connect",
      ],
    },
    {
      name: "ffmpeg",
      steps: [
        `ffmpeg -re -i input.mp3 -c:a libmp3lame -b:a 128k -content_type audio/mpeg \\`,
        `  -f mp3 icecast://source:KEY@${encoder.host}:${encoder.port}${encoder.mount}`,
      ],
    },
  ]

  return (
    <>
      {fields.map((field) => {
        const hidden = field.secret && !revealed
        return (
          <div
            key={field.label}
            className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4"
          >
            <div className="text-xs text-muted-foreground md:w-32 md:shrink-0">
              {field.label}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <code className="text-xs break-all">
                  {hidden ? "•".repeat(24) : field.value}
                </code>
                {field.secret && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 shrink-0"
                    onClick={onToggleReveal}
                    aria-label={revealed ? "Hide stream key" : "Show stream key"}
                  >
                    {revealed ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                  </Button>
                )}
                {!(unreadableKey && field.label === "Password") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 shrink-0"
                    onClick={() => copy(field.label, field.value)}
                    aria-label={`Copy ${field.label.toLowerCase()}`}
                  >
                    {copied === field.label ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  </Button>
                )}
              </div>
              {field.hint && (
                <div className="text-xs text-muted-foreground mt-0.5">{field.hint}</div>
              )}
            </div>
          </div>
        )
      })}

      {/* Per-client field names. Collapsed, because someone who has done
          this before wants the five values above and nothing else. */}
      <details className="border-t border-border pt-4 group">
        <summary className="text-xs text-muted-foreground cursor-pointer select-none marker:content-['']">
          <span className="group-open:hidden">Where these go in BUTT, Mixxx and ffmpeg →</span>
          <span className="hidden group-open:inline">Hide setup steps</span>
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          {clients.map((client) => (
            <div key={client.name}>
              <div className="text-xs font-medium">{client.name}</div>
              <ul className="mt-1 flex flex-col gap-0.5 list-none p-0 m-0">
                {client.steps.map((step) => (
                  <li key={step} className="text-xs text-muted-foreground font-mono break-all">
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </>
  )
}
