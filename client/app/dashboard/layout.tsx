import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/AppSidebar"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { BroadcastMiniController } from "@/components/dashboard/BroadcastMiniController"
import { BroadcastProvider } from "@/contexts/BroadcastContext"
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

  return (
    <BroadcastProvider>
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
    </BroadcastProvider>
  )
}
