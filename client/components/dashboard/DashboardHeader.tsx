"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconLogout } from "@tabler/icons-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User } from "@/interfaces/User"
import api from "@/lib/axios"
import { clearAuth } from "@/actions/auth"

const SEGMENT_LABELS: Record<string, string> = {
  stations: "Stations",
  broadcasts: "Broadcasts",
  live: "Go Live",
  studio: "Studio",
}

interface DashboardHeaderProps {
  user: User
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [stationName, setStationName] = useState<string | null>(null)

  // Extract path segments after /dashboard
  const segments = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean)

  // Detect station slug: segments = ["stations", slug, ...rest]
  const stationSlug = segments[0] === "stations" && segments[1] ? segments[1] : null

  useEffect(() => {
    if (!stationSlug) {
      setStationName(null)
      return
    }
    api.get(`/stations/${stationSlug}`).then((res) => {
      setStationName(res.data.data.name)
    }).catch(() => {
      setStationName(stationSlug)
    })
  }, [stationSlug])

  async function handleSignOut() {
    try {
      await api.post("/logout")
    } finally {
      clearAuth()
      toast.success("Signed out successfully")
      router.push("/")
    }
  }

  // Build breadcrumb items from segments
  function buildCrumbs() {
    const crumbs: { label: string; href: string }[] = []
    let href = "/dashboard"

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      href += `/${seg}`

      // Station slug segment — use fetched name
      if (segments[0] === "stations" && i === 1) {
        crumbs.push({ label: stationName ?? seg, href })
        continue
      }

      crumbs.push({ label: SEGMENT_LABELS[seg] ?? seg, href })
    }

    return crumbs
  }

  const crumbs = buildCrumbs()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />

      {crumbs.length > 0 && (
        <>
          <Separator orientation="vertical" className="mx-1 !h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1
                return (
                  <Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}

      {/* User avatar + dropdown */}
      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="size-8">
                <AvatarImage src={user.avatar_url} alt={user.name} />
                <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <DropdownMenuItem onClick={handleSignOut}>
              <IconLogout size={16} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
