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
  IconUserCircle,
  IconLoader2,
  IconPlaylist,
  IconChartBar,
  IconCheck,
  IconHelpCircle,
  IconMicrophone2,
  IconCalendarTime,
} from "@tabler/icons-react"
import { useState } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { usePlan, useAutoDjLocked, useAudienceLocked } from "@/contexts/AccountContext"
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
   * Which entitlement this item needs, when it needs one. The link stays live
   * either way on purpose: the destination explains the feature and sells the
   * upgrade, and a nav item that silently does nothing teaches people the app
   * is broken. The badge is what stops the click from being a surprise.
   *
   * A named lock rather than a boolean per feature — the two are gated
   * separately (a plan could include audience history without AutoDJ), and a
   * second `requiresX` flag would have to be kept in sync with the first.
   */
  lock?: "autodj" | "audience"
}

/**
 * Every item here is station-scoped — that is why the account page is not
 * among them but in the footer menu, and why the top item is "Overview"
 * rather than "Station", which distinguished it from nothing.
 *
 * Most of them have two destinations, and which one is used depends on
 * whether the slug is known.
 *
 * `href` is the slugless route — /dashboard and /dashboard/library — which
 * resolves the user's one station server-side and forwards. That used to be
 * the ONLY destination, on the reasoning that the sidebar cannot know the slug
 * without a fetch of its own. It can now: the layout resolves the station once
 * for the whole dashboard, so `stationHref` skips the hop entirely.
 *
 * The hop was not free. Every click on "Overview" or "AutoDJ" meant two full
 * page renders instead of one, and the throwaway first render paid for its own
 * `/user` and `/stations` before it could do anything but redirect.
 *
 * The slugless routes stay as the fallback, and stay correct: they are what a
 * user with no station yet gets (/dashboard is the onboarding page), what a
 * failed lookup falls back to, and what the old bookmarks in the wild point at.
 *
 * Their matchers are written out because prefix-on-href cannot separate them:
 * every library URL is also a /dashboard/stations/{slug} URL, so a plain
 * startsWith would light up "Overview" while the user is in AutoDJ.
 */
const NAV_ITEMS: NavItem[] = [
  {
    title: "Overview",
    href: "/dashboard",
    stationHref: (slug) => `/dashboard/stations/${slug}`,
    icon: IconRadio,
    // Every sub-page URL is also a /dashboard/stations/{slug} URL, so a plain
    // prefix match lights this up while the user is somewhere else. Each
    // segment that has its own nav item has to be subtracted by name,
    // including /live and /studio now that the Studio item owns them.
    isActive: (p) =>
      p === "/dashboard" ||
      (/^\/dashboard\/stations\/[^/]+/.test(p) &&
        !/^\/dashboard\/stations\/[^/]+\/(library|schedule|audience|settings|live|studio)/.test(p)),
  },
  {
    // The product's core screen had no way in from the nav: going live meant
    // finding the button on the overview. Idle, this opens pre-flight; while
    // a broadcast runs it goes straight to the studio (see stationHref use).
    title: "Studio",
    href: "/dashboard",
    stationHref: (slug) => `/dashboard/stations/${slug}/live`,
    icon: IconMicrophone2,
    isActive: (p) => /^\/dashboard\/stations\/[^/]+\/(live|studio)/.test(p),
  },
  {
    title: "AutoDJ",
    href: "/dashboard/library",
    stationHref: (slug) => `/dashboard/stations/${slug}/library`,
    icon: IconPlaylist,
    isActive: (p) => p === "/dashboard/library" || /^\/dashboard\/stations\/[^/]+\/library/.test(p),
    lock: "autodj",
  },
  {
    // Its own item, not a tab under AutoDJ: it carries show times too, which
    // every plan has, and it answers the one question a volunteer arrives
    // with — "what's on this week?" — without knowing which feature owns it.
    title: "Schedule",
    href: "/dashboard",
    stationHref: (slug) => `/dashboard/stations/${slug}/schedule`,
    icon: IconCalendarTime,
    isActive: (p) => /^\/dashboard\/stations\/[^/]+\/schedule/.test(p),
  },
  {
    title: "Audience",
    // No slugless fallback: there is nothing to show without a station, and
    // /dashboard is the onboarding page a user in that state belongs on.
    href: "/dashboard",
    stationHref: (slug) => `/dashboard/stations/${slug}/audience`,
    icon: IconChartBar,
    isActive: (p) => /^\/dashboard\/stations\/[^/]+\/audience/.test(p),
    lock: "audience",
  },
  { title: "Broadcasts", href: "/dashboard/broadcasts", icon: IconHistory },
  {
    title: "Settings",
    // Station settings, NOT account settings — those live in the footer menu
    // under the avatar, labelled "Account" so the two never read as the same
    // destination. /dashboard/settings is the account page; pointing this
    // there would be wrong, so it has no slugless route of its own and falls
    // back to onboarding the way Audience does.
    href: "/dashboard",
    stationHref: (slug) => `/dashboard/stations/${slug}/settings`,
    icon: IconSettings,
    isActive: (p) => /^\/dashboard\/stations\/[^/]+\/settings/.test(p),
  },
]

interface AppSidebarProps {
  user: User
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const { signOut, signingOut, isBroadcasting } = useSignOut()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const plan = usePlan()
  const station = useCurrentStation()

  // An unknown plan renders exactly what this sidebar rendered before any of
  // this existed — see useAutoDjLocked. Painting an upgrade nudge at a paying
  // customer because one request timed out is the failure worth avoiding.
  const locked = useAutoDjLocked()
  const audienceLocked = useAudienceLocked()
  const proRequest = useProRequest()
  const { state: broadcastState, stationSlug: liveSlug } = useBroadcast()
  const broadcasting = broadcastState === "live" || broadcastState === "reconnecting"

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
          <SidebarGroupLabel className="sr-only">Station</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = item.isActive ? item.isActive(pathname) : pathname.startsWith(item.href)
                const studioLive = item.title === "Studio" && broadcasting && !!liveSlug
                const href = studioLive
                  ? `/dashboard/stations/${liveSlug}/studio`
                  : station && item.stationHref ? item.stationHref(station.slug) : item.href
                return (
                  // Keyed by title, not href: several items share a slugless
                  // fallback destination (Overview, Audience and Settings all
                  // land on /dashboard when there is no station yet).
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={href} className="cursor-pointer">
                        <item.icon size={18} />
                        <span className="text-sm">{item.title}</span>
                        {studioLive && (
                          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-live-text">
                            <span className="size-1.5 rounded-full bg-live animate-pulse motion-reduce:animate-none" />
                            Live
                          </span>
                        )}
                        {item.lock &&
                          (item.lock === "autodj" ? locked : audienceLocked) && (
                          <Badge variant="pro" className="ml-auto">
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
                className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-input bg-input/30 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-input/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring disabled:opacity-60 disabled:hover:bg-input/30"
              >
                {proRequest.requested ? (
                  <>
                    <IconCheck size={12} aria-hidden />
                    <span>Requested</span>
                  </>
                ) : (
                  <>
                    {/* Pro is granted by hand, not bought, so the verb is
                        "Request". The amber tag names the plan per DESIGN.md
                        instead of a second filled violet button. */}
                    <span>Request</span>
                    <Badge variant="pro">
                      Pro
                    </Badge>
                  </>
                )}
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
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{user.name}</span>
                      {/* Free accounts have the plan card above; a paid one had
                          nothing anywhere saying which plan it was on. */}
                      {plan && !locked && (
                        <Badge variant="pro" className="shrink-0">
                          {plan.name}
                        </Badge>
                      )}
                    </span>
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
                {/* "Account", not "Settings": the sidebar now has a Settings
                    item of its own pointing at the station's settings, and two
                    entries sharing a word and a gear icon for two different
                    destinations is the confusion this menu used to cause. */}
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <IconUserCircle />
                    Account
                  </Link>
                </DropdownMenuItem>
                {/* New tab, like every other help link in the dashboard: a
                    broadcast lives in its tab, so navigating away from a live
                    show to read a help page would end it. See HelpLink. */}
                <DropdownMenuItem asChild>
                  <Link href="/help" target="_blank" rel="noopener noreferrer">
                    <IconHelpCircle />
                    Help
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={signingOut}
                  onClick={() => (isBroadcasting ? setConfirmSignOut(true) : signOut())}
                >
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
      <Dialog open={confirmSignOut} onOpenChange={(next) => !signingOut && setConfirmSignOut(next)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out and end your broadcast?</DialogTitle>
            <DialogDescription>
              The broadcast runs in this tab, so signing out cuts off everyone listening.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setConfirmSignOut(false)}>
              Stay signed in
            </Button>
            <Button variant="destructive" className="h-11" disabled={signingOut} onClick={() => signOut("/", { confirmed: true })}>
              {signingOut ? "Signing out…" : "End and sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
