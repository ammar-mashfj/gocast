"use client"

import { createContext, useContext } from "react"
import type { Plan } from "@/interfaces/Plan"

/**
 * The signed-in account as the API currently sees it — fetched once by the
 * dashboard layout and read by anything under it.
 *
 * Distinct from the `user` cookie, which the layout also reads: the cookie is
 * written at login and never refreshed, so it is the right source for "who is
 * this" and the wrong one for anything that can change mid-session. Plan is
 * exactly that, and after billing ships an upgraded account reading its plan
 * from the cookie would keep seeing the free-tier upsell until it expired.
 *
 * A context rather than a prop chain or a second fetch: the consumers sit far
 * apart in the tree (the sidebar, which the layout owns, and the library
 * screen, which it does not) and they have to agree. A sidebar reading "Pro
 * feature" beside a page with a working upload button is worse than either
 * state alone.
 */
export interface Account {
  email: string
  /** Null when the fetch failed — "don't know", never "free". See usePlan. */
  plan: Plan | null
}

const AccountContext = createContext<Account | null>(null)

export function AccountProvider({
  account,
  children,
}: {
  account: Account | null
  children: React.ReactNode
}) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
}

export function useAccount(): Account | null {
  return useContext(AccountContext)
}

/**
 * Null when `GET /user` failed — the layout renders the dashboard anyway
 * rather than erroring out over a missing upsell.
 *
 * Callers must treat null as "don't know", NOT as "free". Locking a paying
 * customer out of their own library because one request timed out is the
 * worse of the two failures, and the API still enforces the real gate.
 */
export function usePlan(): Plan | null {
  return useAccount()?.plan ?? null
}

/**
 * Does this account NOT have AutoDJ? Deliberately phrased as the negative,
 * because that is the only direction the UI acts on: an unknown plan must
 * render as unlocked, and `!useAutoDjEnabled()` would quietly get that wrong.
 */
export function useAutoDjLocked(): boolean {
  const plan = usePlan()
  return plan !== null && !plan.autodj_enabled
}
