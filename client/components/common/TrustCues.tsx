import { IconBrowser, IconHeadphones, IconCreditCardOff } from "@tabler/icons-react"

const CUES = [
  { icon: IconBrowser, label: "Browser-based", hint: "No install, no plugin" },
  { icon: IconHeadphones, label: "Listeners need no app", hint: "Your link opens the player in any browser" },
  { icon: IconCreditCardOff, label: "Free forever", hint: "No credit card to start" },
] as const

interface TrustCuesProps {
  /**
   * Visual density. `compact` renders a single-line strip of mono labels (no
   * icons, no hint copy) — good beside CTAs where it must not compete. `stacked`
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
            <Icon size={14} className="mt-0.5 shrink-0 text-ok/80" />
            <span>
              <span className="text-foreground">{label}.</span>{" "}
              <span>{hint}.</span>
            </span>
          </li>
        ))}
      </ul>
    )
  }

  // No icons here: on the homepage this sits on the primary button's row, and
  // three green glyphs next to the one filled button read as a second thing
  // to look at. Mono and tracked, it is the page's eyebrow voice instead.
  return (
    <ul
      role="list"
      className={`flex flex-wrap items-center justify-center gap-x-4.5 gap-y-2 font-mono text-xs font-medium tracking-[0.04em] text-text-faint ${className}`}
    >
      {CUES.map(({ label }) => (
        <li key={label}>{label}</li>
      ))}
    </ul>
  )
}
