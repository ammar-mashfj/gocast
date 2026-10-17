"use client"

import { useAudienceLocked } from "@/contexts/AccountContext"
import { ProTag } from "@/components/ds/Tag"

/** "PRO" beside a link to Audience, for an account whose plan has no analytics. */
export function AudienceProTag({ className }: { className?: string }) {
  return useAudienceLocked() ? <ProTag className={className} /> : null
}
