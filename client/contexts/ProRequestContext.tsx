"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { ProAccessDialog } from "@/components/ProAccessDialog"
import { useAccount } from "@/contexts/AccountContext"

/**
 * The "Request Pro access" dialog, mounted once for the whole dashboard.
 *
 * Every upgrade affordance — the sidebar plan card, the library header, the
 * AutoDJ upsell panel — opens THIS dialog rather than one of its own. Two
 * reasons it lives at the layout and not on the screen that first needed it:
 *
 * 1. "Requested" is one fact about the account, not per-screen state. Held
 *    locally, a request sent from the sidebar would leave the library page
 *    still offering the same form.
 * 2. The sidebar renders on every dashboard route, so its Upgrade button
 *    needs somewhere to open a dialog from that outlives any one page.
 *
 * Session-scoped on purpose: it resets on reload. The API has no "has this
 * account already requested" endpoint, and inventing one to grey out a button
 * would be a lot of machinery for a resubmit that `updateOrCreate` already
 * handles by updating the row in place.
 *
 * These dashboard affordances are now the ONLY way to request Pro — the
 * pricing page's button was removed, because a request from someone with no
 * station is not something anyone can act on. If they all end up hidden at
 * once (see useAutoDjLocked's unknown-plan fallback), there is no other path
 * in.
 */
interface ProRequestValue {
  open: () => void
  requested: boolean
}

const ProRequestContext = createContext<ProRequestValue>({
  open: () => {},
  requested: false,
})

export function ProRequestProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount()
  const [isOpen, setIsOpen] = useState(false)
  const [requested, setRequested] = useState(false)

  const value = useMemo<ProRequestValue>(
    () => ({ open: () => setIsOpen(true), requested }),
    [requested],
  )

  const markRequested = useCallback(() => setRequested(true), [])

  return (
    <ProRequestContext.Provider value={value}>
      {children}
      <ProAccessDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        plan="pro"
        accountEmail={account?.email}
        onSubmitted={markRequested}
      />
    </ProRequestContext.Provider>
  )
}

export function useProRequest(): ProRequestValue {
  return useContext(ProRequestContext)
}
