import Link from "next/link"
import { Card } from "@/components/ds/Card"
import { cn } from "@/lib/utils"

/**
 * The one card every auth page is: a display title, a muted lead, then
 * whatever the page needs. Fixed at the measure of a form (24rem), so sign in
 * and sign up line up with each other and with the dialog that follows them.
 */
export function AuthCard({
  title,
  lead,
  children,
  className,
}: {
  title: string
  lead?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("w-full max-w-sm gap-5", className)}>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display text-balance">{title}</h1>
        {lead && <p className="text-body text-muted-foreground text-pretty">{lead}</p>}
      </div>
      {children}
    </Card>
  )
}

/** "or", between the form and the Google button. */
export function OrRule() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="eyebrow text-text-faint">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/** A link inside running copy: the AutoDJ violet, as links are on the homepage. */
export function AuthLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-semibold text-on-air-text no-underline transition-colors hover:text-foreground", className)}>
      {children}
    </Link>
  )
}

/** The "Already have an account?" line under a card. */
export function AuthFooter({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-body-sm text-muted-foreground">{children}</p>
}

// The consent row moved to the design kit; re-exported for the auth pages.
export { CheckboxRow } from "@/components/ds/Checkbox"
