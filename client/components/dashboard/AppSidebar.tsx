"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCheck, IconLoader2, IconSelector } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { usePlan, useAutoDjLocked, useAudienceLocked } from "@/contexts/AccountContext"
import { useCurrentStation, type CurrentStation } from "@/contexts/StationContext"
import { useProRequest } from "@/contexts/ProRequestContext"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useSignOut } from "@/hooks/useSignOut"
import { airState } from "@/lib/airState"
import { AUTODJ_GROUP, AUTODJ_ITEMS, NAV_ITEMS, activeNav, inAutoDj, type NavItem } from "@/lib/dashboardNav"
import { cn } from "@/lib/utils"
import { User } from "@/interfaces/User"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ds/Menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ds/Dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StationArtwork } from "@/components/StationArtwork"
import { Button } from "@/components/ds/Button"
import { StatusLamp } from "@/components/ds/StatusLamp"

/**
 * The dashboard sidebar, as the prototype draws it: the wordmark, the
 * station with its live state, a text-only nav, and the account at the
 * bottom. Free accounts also get the plan card and PRO tags on the features
 * their plan doesn't include. Below 1024px it is a drawer (components/ui/
 * sidebar.tsx).
 */
export function AppSidebar({ user }: { user: User }) {
  const pathname = usePathname() ?? ""
  const station = useCurrentStation()
  const { isMobile, setOpenMobile } = useSidebar()

  // The drawer stays open across a client-side navigation unless told.
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [pathname, isMobile, setOpenMobile])

  return (
    <Sidebar className="border-r border-line">
      <SidebarHeader className="gap-4.5 px-3.5 pt-5 pb-0">
        <Link href="/dashboard" className="px-2 py-1 font-display text-title-sm font-bold" aria-label="GoCast home">
          Go<span className="text-on-air">Cast</span>
          <span className="text-text-faint">.fm</span>
        </Link>
        {station && <StationCard station={station} />}
      </SidebarHeader>

      <SidebarContent className="px-3.5 pt-4.5">
        <Nav pathname={pathname} station={station} />
      </SidebarContent>

      <SidebarFooter className="gap-2 px-3.5 pb-4">
        <PlanCard />
        <AccountMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}

/** The station and what it is doing, as the band says it. */
function StationCard({ station }: { station: CurrentStation }) {
  const air = useCoarseAir(station.slug)
  return (
    <Link
      href={`/dashboard/stations/${station.slug}`}
      className="flex items-center gap-3 rounded-well bg-card p-2.5 transition-colors hover:bg-surface-raised"
    >
      <StationArtwork src={station.artwork_url} alt="" className="size-10 shrink-0 rounded-item text-text-faint" iconSize={16} sizes="40px" />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate font-display text-body leading-tight font-bold">{station.name}</span>
        <StatusLamp tone={air.tone} size="sm">{air.label}</StatusLamp>
      </span>
    </Link>
  )
}

function Nav({ pathname, station }: { pathname: string; station: CurrentStation | null }) {
  const active = activeNav(pathname)
  const autoDjLocked = useAutoDjLocked()
  const audienceLocked = useAudienceLocked()
  const { state, stationSlug } = useBroadcast()
  const broadcastingHere = state === "live" || state === "reconnecting"
  const air = useCoarseAir(station?.slug ?? null)

  function hrefFor(item: NavItem): string {
    // While a show runs from this tab, Studio is the studio, not pre-flight.
    if (item.key === "studio" && broadcastingHere && stationSlug) return `/dashboard/stations/${stationSlug}/studio`
    return station && item.stationHref ? item.stationHref(station.slug) : item.href
  }

  const lockFor = (lock: NavItem["lock"]) => (lock === "autodj" ? autoDjLocked : lock === "audience" ? audienceLocked : false)

  return (
    <nav aria-label="Station" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        if (item.group === "autodj") {
          // The group is drawn once, at its first section.
          if (item !== AUTODJ_ITEMS[0]) return null
          return (
            <div key="autodj" role="group" aria-labelledby="nav-autodj" className="flex flex-col gap-0.5">
              <Link
                id="nav-autodj"
                href={hrefFor(item)}
                className={cn(
                  "flex h-10.5 items-center justify-between gap-2 rounded-item px-3 text-body transition-colors hover:bg-surface-raised hover:text-foreground",
                  inAutoDj(active) ? "font-bold text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{AUTODJ_GROUP.label}</span>
                {air.tone === "onair" && <StatusLamp tone="onair" size="sm">On</StatusLamp>}
                {lockFor(AUTODJ_GROUP.lock) && <ProTag />}
              </Link>
              {AUTODJ_ITEMS.map((child) => (
                <NavLink key={child.key} href={hrefFor(child)} active={child.key === active} nested>
                  {child.label}
                </NavLink>
              ))}
            </div>
          )
        }
        const live = item.key === "studio" && (broadcastingHere || air.tone === "live" || air.tone === "mic")
        return (
          <NavLink key={item.key} href={hrefFor(item)} active={item.key === active}>
            <span>{item.label}</span>
            {live && <StatusLamp tone="live" size="sm" pulse>Live</StatusLamp>}
            {lockFor(item.lock) && <ProTag />}
          </NavLink>
        )
      })}
    </nav>
  )
}

function NavLink({ href, active, nested, children }: { href: string; active: boolean; nested?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-item px-3 transition-colors",
        // Sections hang off the heading's text: a rule down their left
        // edge, a step smaller, so the group reads as one block.
        nested ? "ml-3 h-9 border-l border-line pl-3.5 text-body-sm" : "h-10.5 text-body",
        nested && "rounded-l-none",
        active
          ? "bg-surface-raised font-bold text-foreground"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      {children}
    </Link>
  )
}

/** The band's state without the studio's detail: enough for a lamp. */
function useCoarseAir(slug: string | null) {
  const { status, loading, showEnding } = useStationStatus(slug ?? "", slug !== null)
  const { state, stationSlug } = useBroadcast()
  const autoDjLocked = useAutoDjLocked()
  return airState({
    status,
    statusLoading: loading,
    broadcastState: stationSlug === slug ? state : "idle",
    signal: null,
    micLatched: false,
    autoDjLocked,
    onStudio: false,
    showEnding,
  })
}

function ProTag() {
  return <span className="rounded-tag bg-fault px-1.5 py-0.75 eyebrow-sm text-fault-ink">Pro</span>
}

/**
 * Free accounts only. Above the account row because the question it answers
 * — "why does my station go quiet?" — comes up while looking at the nav.
 * Pro is granted by hand, not bought, so the verb is "Request".
 */
function PlanCard() {
  const plan = usePlan()
  const locked = useAutoDjLocked()
  const proRequest = useProRequest()
  if (!locked) return null

  return (
    <div className="flex flex-col gap-2 rounded-well bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-bold">{plan?.name ?? "Free"} plan</span>
        <Button size="sm" variant="pro" onClick={proRequest.open} disabled={proRequest.requested} className="h-7.5 px-2.5 text-caption">
          {proRequest.requested ? (
            <>
              <IconCheck className="size-3.5" aria-hidden />
              Requested
            </>
          ) : (
            "Request Pro"
          )}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        {proRequest.requested
          ? "Request sent — we’ll be in touch."
          : "Your station goes silent when you stop broadcasting."}
      </p>
    </div>
  )
}

function AccountMenu({ user }: { user: User }) {
  const plan = usePlan()
  const locked = useAutoDjLocked()
  const { signOut, signingOut, isBroadcasting } = useSignOut()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-button p-2 text-left transition-colors outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-card">
          <Avatar className="size-9.5 shrink-0">
            <AvatarImage src={user.avatar_url} alt="" />
            <AvatarFallback className="bg-surface-strong font-display text-sm font-bold">{initials}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <span className="truncate">{user.name}</span>
              {/* Free accounts have the plan card; a paid plan is named here. */}
              {plan && !locked && <ProTag />}
            </span>
            <span className="truncate text-caption text-text-faint">{user.email}</span>
          </span>
          <IconSelector className="size-4 shrink-0 text-text-faint" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">Account and plan</Link>
          </DropdownMenuItem>
          {/* New tab: a broadcast lives in this tab, and leaving it ends the show. */}
          <DropdownMenuItem asChild>
            <Link href="/help" target="_blank" rel="noopener noreferrer">Help</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={signingOut}
            className="text-muted-foreground"
            onClick={() => (isBroadcasting ? setConfirmSignOut(true) : signOut())}
          >
            {signingOut && <IconLoader2 className="animate-spin" />}
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmSignOut} onOpenChange={(next) => !signingOut && setConfirmSignOut(next)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out and end your broadcast?</DialogTitle>
            <DialogDescription>
              The broadcast runs in this tab, so signing out cuts off everyone listening.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="subtle" onClick={() => setConfirmSignOut(false)}>
              Stay signed in
            </Button>
            <Button variant="live" disabled={signingOut} onClick={() => signOut("/", { confirmed: true })}>
              {signingOut ? "Signing out…" : "End and sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
