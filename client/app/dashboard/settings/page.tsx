"use client"

import { useState } from "react"
import { useMounted } from "@/hooks/useMounted"
import { getUser } from "@/actions/auth"
import type { User } from "@/interfaces/User"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ds/PageHeader"
import { DeleteAccount } from "@/components/dashboard/account/DeleteAccount"
import { PasswordForm } from "@/components/dashboard/account/PasswordForm"
import { PlanCard } from "@/components/dashboard/account/PlanCard"
import { ProfileForm } from "@/components/dashboard/account/ProfileForm"

/**
 * Account: the plan, who you are, your password, and leaving. One column,
 * like the prototype — four short forms read top to bottom.
 *
 * "Account", not "Settings": the station has its own Station settings one
 * click away, and two pages titled Settings left nobody sure which was which.
 *
 * The user comes from the auth cookie, read after mount (the server render
 * can't see it).
 */
export default function AccountPage() {
  const mounted = useMounted()
  // The cookie's copy until a form saves a newer one.
  const [updated, setUser] = useState<User | null>(null)
  const user = updated ?? (mounted ? getUser() : null)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Account" />
      {user ? (
        <>
          <PlanCard />
          {/* Keyed by id so a different sign-in starts the form fresh. */}
          <ProfileForm key={user.id} user={user} onUpdated={setUser} />
          <PasswordForm user={user} onUpdated={setUser} />
          <DeleteAccount email={user.email} />
        </>
      ) : (
        <div className="flex flex-col gap-5 motion-reduce:[&_[data-slot=skeleton]]:animate-none" aria-busy>
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-60 rounded-card" />
        </div>
      )}
    </div>
  )
}
