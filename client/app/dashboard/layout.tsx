import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/AppSidebar"
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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </BroadcastProvider>
  )
}
