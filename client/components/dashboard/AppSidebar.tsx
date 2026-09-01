"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconRadio,
  IconHistory,
  IconLogout,
  IconChevronUp,
  IconSettings,
  IconLoader2,
  IconPlaylist,
  IconSparkles,
  IconCheck,
} from "@tabler/icons-react"
import { useSignOut } from "@/hooks/useSignOut"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { usePlan, useAutoDjLocked } from "@/contexts/AccountContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { User } from "@/interfaces/User"

interface NavItem {
  title: string
  /** Where this goes when the station has not been resolved. */
  href: string
  /** Direct destination once the slug is known — see NAV_ITEMS. */
  stationHref?: (slug: string) => string
  icon: typeof IconRadio
  /** Custom matcher when prefix-on-href is too narrow (e.g. AutoDJ also lights
      up on per-station library pages). Defaults to startsWith(href). */
  isActive?: (pathname: string) => boolean
  /**
   * Marks an item the current plan does not include. The link stays live on
   * purpose: the destination explains the feature and sells the upgrade, and
   * a nav item that silently does nothing teaches people the app is broken.
   * The badge is what stops the click from being a surprise.
   */
  requiresAutoDj?: boolean
}

/**
 * Both station-scoped items have two destinations, and which one is used
 * depends on whether the slug is known.
 *
 * `href` is the slugless route — /dashboard and /dashboard/library — which
 * resolves the user's one station server-side and forwards. That used to be
 * the ONLY destination, on the reasoning that the sidebar cannot know the slug
 * without a fetch of its own. It can now: the layout resolves the station once
 * for the whole dashboard, so `stationHref` skips the hop entirely.
 *
 * The hop was not free. Every click on "Station" or "AutoDJ" meant two full
 * page renders instead of one, and the throwaway first render paid for its own
 * `/user` and `/stations` before it could do anything but redirect.
 *
 * The slugless routes stay as the fallback, and stay correct: they are what a
 * user with no station yet gets (/dashboard is the onboarding page), what a
 * failed lookup falls back to, and what the old bookmarks in the wild point at.
 *
 * Their matchers are written out because prefix-on-href cannot separate them:
 * every library URL is also a /dashboard/stations/{slug} URL, so a plain
 * startsWith would light up "Station" while the user is in AutoDJ.
 */
const NAV_ITEMS: NavItem[] = [
  {
    title: "Station",
    href: "/dashboard",
    stationHref: (slug) => `/dashboard/stations/${slug}`,
    icon: IconRadio,
    isActive: (p) =>
      p === "/dashboard" ||
      (/^\/dashboard\/stations\/[^/]+/.test(p) && !/^\/dashboard\/stations\/[^/]+\/library/.test(p)),
  },
  {
    title: "AutoDJ",
    href: "/dashboard/library",
    stationHref: (slug) => `/dashboard/stations/${slug}/library`,
    icon: IconPlaylist,
    isActive: (p) => p === "/dashboard/library" || /^\/dashboard\/stations\/[^/]+\/library/.test(p),
    requiresAutoDj: true,
  },
  { title: "Broadcasts", href: "/dashboard/broadcasts", icon: IconHistory },
  { title: "Settings", href: "/dashboard/settings", icon: IconSettings },
]

interface AppSidebarProps {
  user: User
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const { signOut, signingOut } = useSignOut()
  const plan = usePlan()
  const station = useCurrentStation()

  // An unknown plan renders exactly what this sidebar rendered before any of
  // this existed — see useAutoDjLocked. Painting an upgrade nudge at a paying
  // customer because one request timed out is the failure worth avoiding.
  const locked = useAutoDjLocked()
  const proRequest = useProRequest()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <Image src="/logo.svg" alt="GoCast" width={171} height={27} className="h-4 w-auto" priority />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = item.isActive ? item.isActive(pathname) : pathname.startsWith(item.href)
                const href = station && item.stationHref ? item.stationHref(station.slug) : item.href
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={href} className="cursor-pointer">
                        <item.icon size={18} />
                        <span className="text-sm">{item.title}</span>
                        {item.requiresAutoDj && locked && (
                          <Badge
                            variant="outline"
                            className="ml-auto border-primary/30 bg-primary/10 px-1.5 text-[9px] tracking-wider text-primary uppercase"
                          >
                            Pro
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* The plan card sits above the account menu rather than inside it:
            the thing it has to answer — "why does my station go quiet?" — is
            a question people have while looking at the nav, not while looking
            for a sign-out button. */}
        {locked && (
          <div className="mx-1 mb-1 rounded-lg border border-primary/20 bg-primary/[0.06] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{plan?.name ?? "Free"} plan</span>
              {/* Opens the request form rather than navigating. This button
                  sits on every dashboard route, and sending someone to the
                  library page first would interrupt whatever they were doing
                  to re-explain a feature they just told us they want. The
                  line below is the whole pitch it needs. */}
              <button
                type="button"
                onClick={proRequest.open}
                disabled={proRequest.requested}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100"
              >
                {proRequest.requested ? <IconCheck size={11} /> : <IconSparkles size={11} />}
                {proRequest.requested ? "Requested" : "Upgrade"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {proRequest.requested
                ? "Request sent — we'll be in touch."
                : "Your station goes silent when you stop broadcasting."}
            </p>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={user.avatar_url} alt={user.name} />
                    <AvatarFallback className="rounded-lg">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <IconChevronUp className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <IconSettings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={signingOut} onClick={() => signOut()}>
                  {signingOut
                    ? <IconLoader2 className="animate-spin" />
                    : <IconLogout />}
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
