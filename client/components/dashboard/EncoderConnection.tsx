"use client"

import { useState } from "react"
import { toast } from "sonner"
import { copyText } from "@/lib/clipboard"
import { Button } from "@/components/ds/Button"
import { Disclosure } from "@/components/ds/Disclosure"
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
 * Station settings is its only home today, and the only place the key can be
 * rotated. Kept as its own component so the five values stay in one place if
 * another screen needs them again (the go-live page used to).
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
  //
  // Each step is prose with the actual values set apart: prose reads in the
  // body face, and only the strings somebody types or pastes (host, port,
  // mount, username, key) are mono. A menu path or an option to pick is a
  // `{ ui }` segment — it names something on their screen, so it stands out
  // without pretending to be a machine string.
  type Segment = string | { value: string } | { ui: string }
  const v = (value: string): Segment => ({ value })
  const ui = (label: string): Segment => ({ ui: label })
  const clients: Array<{ name: string; steps: Segment[][]; command?: string }> = [
    {
      name: "BUTT",
      steps: [
        ["Open ", ui("Settings → Main → Server → Add"), "."],
        ["Set the type to ", ui("Icecast"), "."],
        ["Address ", v(encoder.host), ", port ", v(String(encoder.port)), "."],
        ["Mountpoint ", v(encoder.mount.replace(/^\//, "")), " — without the slash, because BUTT adds it."],
        ["User ", v(encoder.username), ", and your stream key as the password."],
      ],
    },
    {
      name: "Mixxx",
      steps: [
        ["Open ", ui("Preferences → Live Broadcasting → Server connection"), "."],
        ["Set the type to ", ui("Icecast 2"), "."],
        ["Host ", v(encoder.host), " — the name only, no http:// in front — and port ", v(String(encoder.port)), "."],
        ["Mount ", v(encoder.mount), "."],
        ["Login ", v(encoder.username), ", and your stream key as the password."],
        ["Then turn on ", ui("Options → Enable Live Broadcasting"), " to connect."],
      ],
    },
    {
      name: "ffmpeg",
      steps: [["Paste this into a terminal, with ", v("KEY"), " swapped for your stream key."]],
      command:
        `ffmpeg -re -i input.mp3 -c:a libmp3lame -b:a 128k -content_type audio/mpeg \\\n` +
        `  -f mp3 icecast://${encoder.username}:KEY@${encoder.host}:${encoder.port}${encoder.mount}`,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-1.5">
        {fields.map((field) => {
          const hidden = field.secret && !revealed
          const copyable = !(unreadableKey && field.label === "Password")
          return (
            <div key={field.label} className="flex flex-col gap-1 rounded-control bg-surface-inset px-3.5 py-2.5">
              <div className="flex items-center gap-3">
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

      {/* Per-client field names. Folded, because someone who has done this
          before wants the five values above and nothing else. */}
      <Disclosure title="Where these go in BUTT, Mixxx and ffmpeg">
        <div className="flex flex-col gap-4">
          {clients.map((client) => (
            <div key={client.name} className="flex flex-col gap-1.5">
              <span className="text-body-sm font-semibold text-foreground">{client.name}</span>
              <ol className="flex flex-col gap-1">
                {client.steps.map((step, i) => (
                  <li key={i} className="text-body-sm text-muted-foreground">
                    {step.map((seg, j) =>
                      typeof seg === "string" ? (
                        seg
                      ) : "value" in seg ? (
                        <code key={j} className="font-mono break-all text-foreground">{seg.value}</code>
                      ) : (
                        <span key={j} className="font-semibold text-foreground">{seg.ui}</span>
                      ),
                    )}
                  </li>
                ))}
              </ol>
              {client.command && (
                <pre className="overflow-x-auto rounded-control bg-surface-inset px-3 py-2.5 font-mono text-caption whitespace-pre text-foreground">
                  {client.command}
                </pre>
              )}
            </div>
          ))}
        </div>
      </Disclosure>
    </div>
  )
}
