import { IconBrowser, IconShieldLock, IconCreditCardOff } from "@tabler/icons-react"

const CUES = [
  { icon: IconBrowser, label: "Browser-based", hint: "No install, no plugin" },
  { icon: IconShieldLock, label: "Private until shared", hint: "Stations are hidden until you send the link" },
  { icon: IconCreditCardOff, label: "Free forever", hint: "No credit card to start" },
] as const

interface TrustCuesProps {
  /**
   * Visual density. `compact` renders a single-line strip of icon+label (no
   * hint copy) — good under CTAs where vertical space is tight. `stacked`
   * renders three rows with icon, label, and hint — good inside auth cards.
   */
  variant?: "compact" | "stacked"
  className?: string
}

/**
 * Short, unmistakable trust cues for the moments right before a visitor
 * commits — landing-page CTAs and the register card. Deliberately kept to
 * three items so it reads at a glance and doesn't start to feel marketing-y.
 */
export function TrustCues({ variant = "compact", className = "" }: TrustCuesProps) {
  if (variant === "stacked") {
    return (
      <ul className={`flex flex-col gap-2 ${className}`} role="list">
        {CUES.map(({ icon: Icon, label, hint }) => (
          <li key={label} className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <Icon size={14} className="mt-0.5 shrink-0 text-emerald-400/80" />
            <span>
              <span className="text-foreground">{label}.</span>{" "}
              <span>{hint}.</span>
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul
      role="list"
      className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-text-muted ${className}`}
    >
      {CUES.map(({ icon: Icon, label }) => (
        <li key={label} className="flex items-center gap-1.5">
          <Icon size={13} className="text-emerald-400/80" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  )
}
