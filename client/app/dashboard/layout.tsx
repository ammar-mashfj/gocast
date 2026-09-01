import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/AppSidebar"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { BroadcastMiniController } from "@/components/dashboard/BroadcastMiniController"
import { BroadcastProvider } from "@/contexts/BroadcastContext"
import { AccountProvider, type Account } from "@/contexts/AccountContext"
import { StationProvider, type CurrentStation } from "@/contexts/StationContext"
import { ProRequestProvider } from "@/contexts/ProRequestContext"
import { apiFetch } from "@/lib/api-server"
import { getMyStation } from "@/lib/station-server"
import { User } from "@/interfaces/User"

// Belt-and-suspenders with robots.txt — Google occasionally indexes
// robots-disallowed URLs anyway (with a "no information" snippet) if it
// finds inbound links. Per-page noindex closes that gap.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value
  const userCookie = cookieStore.get("user")?.value

  if (!token || !userCookie) {
    redirect("/auth/login")
  }

  const user: User = JSON.parse(decodeURIComponent(userCookie))

  // Unverified sessions must never see the dashboard shell. The login page
  // detects the dangling cookie on mount and auto-opens the verify modal —
  // that's the single recovery path for stale unverified sessions.
  if (!user.email_verified_at) {
    redirect("/auth/login")
  }

  // The cookie carries identity, not entitlements — it is written once at
  // login, so a plan read from it would still say "Free" for the rest of the
  // session after an upgrade. One request here, shared with every consumer
  // through AccountProvider, is what keeps the sidebar and the library screen
  // from disagreeing about what this account can do.
  //
  // A failure is not fatal. The plan only decides which upsell to paint; the
  // API enforces the real gate, so a dashboard with no upsell beats an error
  // page, and `usePlan()` returns null for "don't know" rather than "free".
  //
  // Resolved in parallel with the station below. These two are independent
  // and both sit in front of the first byte of every dashboard page, so
  // running them back to back would put two full API round-trips on the
  // critical path where one is enough.
  const [account, station] = await Promise.all([
    apiFetch<{ data: User }>("/user")
      .then(({ data }): Account => ({ email: data.email, plan: data.plan ?? null }))
      .catch((err): Account => {
        console.error("[dashboard] account fetch failed:", err)
        return { email: user.email, plan: null }
      }),
    // The station's IDENTITY, for the chrome — see StationContext. Resolving
    // it here is what lets the header name the station without a fetch of its
    // own, and lets the sidebar link straight into it instead of bouncing
    // every click through /dashboard to look the slug up again.
    //
    // Same failure posture as the account: a dashboard whose breadcrumb says
    // less beats an error page, and every page under this one fetches the
    // station data it actually renders for itself.
    getMyStation()
      .then((s): CurrentStation | null =>
        s
          ? {
              slug: s.slug,
              name: s.name,
              artwork_url: s.artwork_url,
              genre: s.genre,
              description: s.description,
            }
          : null,
      )
      .catch((err) => {
        console.error("[dashboard] station lookup failed:", err)
        return null
      }),
  ])

  return (
    <BroadcastProvider>
      <AccountProvider account={account}>
        {/* Inside AccountProvider: the dialog prefills from the account. */}
        <ProRequestProvider>
          <StationProvider station={station}>
            <SidebarProvider>
              <AppSidebar user={user} />
              <SidebarInset>
                <DashboardHeader />
                <main className="flex-1 p-6">
                  {children}
                </main>
                <BroadcastMiniController />
              </SidebarInset>
            </SidebarProvider>
          </StationProvider>
        </ProRequestProvider>
      </AccountProvider>
    </BroadcastProvider>
  )
}
