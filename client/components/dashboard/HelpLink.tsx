import Link from "next/link"
import { IconHelpCircle } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

interface HelpLinkProps {
  /** Article slug under /help — e.g. "my-encoder-wont-connect". */
  article: string
  /**
   * Completes "Help: …" as the accessible name, so it has to name the SUBJECT
   * rather than the action. "connecting an encoder", not "click for help".
   *
   * A bare "?" is invisible to a screen reader and indistinguishable from the
   * three other "?"s on the same screen, which is why this is required rather
   * than optional.
   */
  label: string
  className?: string
}

/**
 * The little `?` beside a control that people get stuck on.
 *
 * PUT THESE WHERE SOMEBODY IS ACTUALLY STUCK — the encoder fields, the slot
 * editor, the power button — and nowhere else. A `?` on every card is
 * wallpaper: people stop seeing them, including on the three controls where
 * one would have saved a support email. Scarcity is the entire mechanism.
 *
 * ALWAYS OPENS A NEW TAB, unconditionally. A broadcast lives in its tab —
 * BroadcastContext holds the microphone stream and dies with the document — so
 * for a broadcaster who is on air, an in-place navigation to a help page is
 * the one click in the dashboard that can end their show. Conditioning this on
 * live state would be both more code and more ways to get it wrong, and a new
 * tab is a perfectly good default for someone who is not broadcasting.
 */
export function HelpLink({ article, label, className }: HelpLinkProps) {
  return (
    <Link
      href={`/help/${article}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Help: ${label}`}
      title={`Help: ${label}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <IconHelpCircle size={15} aria-hidden />
    </Link>
  )
}
