"use client"

import Link from "next/link"
import type { Station } from "@/interfaces/Station"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useMounted } from "@/hooks/useMounted"
import { comingUp } from "@/lib/comingUp"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardLink } from "@/components/ds/Card"
import { List } from "@/components/ds/List"

/**
 * What's next on the station: your next shows (red, you) and AutoDJ's next
 * slot (violet). Rendered after hydration — "Today" depends on the clock,
 * and the server's isn't the browser's.
 */
export function ComingUpCard({ station }: { station: Station }) {
  const mounted = useMounted()
  const autoDjLocked = useAutoDjLocked()
  const schedulePage = autoDjLocked
    ? { href: `/dashboard/stations/${station.slug}/settings#show-times`, label: "Show times →" }
    : { href: `/dashboard/stations/${station.slug}/schedule`, label: "Schedule →" }

  const items = mounted
    ? comingUp({ schedules: station.schedules, programme: station.programme, timeZone: station.timezone, now: new Date() })
    : null

  return (
    <Card className="gap-1.5">
      <CardHeader title="Coming up" aside={<CardLink href={schedulePage.href}>{schedulePage.label}</CardLink>} className="mb-1.5" />
      {items === null ? (
        <div className="h-20" />
      ) : items.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          Nothing scheduled.{" "}
          <Link href={`/dashboard/stations/${station.slug}/settings#show-times`} className="text-violet-muted hover:underline">
            Set your show times
          </Link>{" "}
          so listeners know when to come back
          {autoDjLocked ? "." : (
            <>
              , or{" "}
              <Link href={`/dashboard/stations/${station.slug}/schedule`} className="text-violet-muted hover:underline">
                plan what AutoDJ plays
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <List>
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3.5 py-2.5">
              <span className="w-28 shrink-0 font-mono text-body-sm font-semibold text-muted-foreground">{item.when}</span>
              <span aria-hidden className={cn("h-7.5 w-1 shrink-0 rounded-full", item.kind === "show" ? "bg-live" : "bg-on-air")} />
              <span className="flex min-w-0 flex-col gap-0.75">
                <span className="truncate text-body font-semibold">{item.title}</span>
                <span className="truncate text-caption text-text-faint">{item.meta}</span>
              </span>
            </li>
          ))}
        </List>
      )}
    </Card>
  )
}
