import { isLifetime } from "@/lib/billing-catalog"
import { getCatalog } from "@/lib/billing-server"
import { PricingPlans } from "./PricingPlans"
import { Section, SectionIntro } from "./Section"

const LAST_UPDATED = "14 October 2026"

/**
 * Free, Pro and Custom, with Pro's terms on a switch. The terms are the
 * catalog's paid ones, shortest first; lifetime is never listed here, it is a
 * dashboard-only offer switched on and off by hand.
 */
export default async function PricingSection({ isAuthed }: { isAuthed: boolean }) {
  const catalog = await getCatalog()
  const terms = (catalog ?? [])
    .filter((p) => p.plan?.slug !== "free" && !isLifetime(p) && p.duration.unit === "month" && p.duration.count)
    .sort((a, b) => (a.duration.count ?? 0) - (b.duration.count ?? 0))

  return (
    <Section id="pricing">
      <PricingPlans
        terms={terms}
        isAuthed={isAuthed}
        intro={
          <SectionIntro
            eyebrow="Pricing"
            title="Free is the whole product."
            lead={
              <>
                Free needs no card and never runs out.{" "}
                <span className="hidden sm:inline">Everything below is live today — </span>Pro is there when you outgrow it.
              </>
            }
          />
        }
      />
      <p className="text-center font-mono text-caption text-text-faint lg:text-left">Pricing last updated {LAST_UPDATED}</p>
    </Section>
  )
}
