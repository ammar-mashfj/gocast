"use client"

import { usePlan } from "@/contexts/AccountContext"
import { GetProTile, ProFeaturesCard } from "./GetProTile"

/**
 * Under the hero, Free accounts only (never while the plan is unknown): the
 * Pro offer and nothing else. Phones get the one-line Get Pro tile, tablet
 * and PC the big Pro card. No chart or show links on purpose — the overview
 * is a glance, not a report; Live history is in the sidebar.
 */
export function OverviewBelow() {
  const plan = usePlan()
  if (plan?.slug !== "free") return null
  return (
    <>
      <GetProTile className="sm:hidden" />
      <ProFeaturesCard wide className="max-sm:hidden" />
    </>
  )
}
