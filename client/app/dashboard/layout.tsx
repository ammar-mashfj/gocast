import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/AppSidebar"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { BroadcastProvider } from "@/contexts/BroadcastContext"
import { User } from "@/interfaces/User"

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

  return (
    <BroadcastProvider>
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset>
          <DashboardHeader user={user} />
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </BroadcastProvider>
  )
}
