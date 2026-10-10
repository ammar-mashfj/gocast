import { cn } from "@/lib/utils"

/**
 * The design system's wordmark: "Go" off-white, "Cast" violet, ".fm" faint.
 * Text, not a file, so it takes the palette of whichever surface it sits on
 * — the homepage's warm violet, the help and blog pages' older one.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex font-display text-title-sm tracking-tight", className)}>
      <span className="text-foreground">Go</span>
      <span className="text-on-air">Cast</span>
      <span className="text-text-faint">.fm</span>
    </span>
  )
}
