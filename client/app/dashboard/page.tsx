import { redirect } from "next/navigation"
import { IconRadio, IconBolt, IconShare3, IconHeadphones } from "@tabler/icons-react"
import { getMyStation } from "@/lib/station-server"
import { CreateStationButton } from "@/components/dashboard/CreateStationButton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"

/**
 * The dashboard root, and the only place that answers "which station is this?".
 *
 * A user has one station, so there is no list to land on: this either sends
 * them into it or, when they have not made it yet, IS the onboarding page.
 * Everything else in the dashboard links here rather than to a station URL,
 * because this is the one route that can resolve the slug.
 */
export default async function DashboardPage() {
  const station = await getMyStation()

  if (station) {
    redirect(`/dashboard/stations/${station.slug}`)
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Empty className="py-10">
        <EmptyMedia variant="icon">
          <IconRadio size={48} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle className="text-lg">Create your station</EmptyTitle>
          <EmptyDescription className="text-sm">
            Name it, give it a vibe, and you&apos;ll be on air in under a minute.
          </EmptyDescription>
        </EmptyHeader>
        <CreateStationButton />
      </Empty>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <IconBolt size={18} className="text-primary mb-2" />
          <div className="text-sm font-medium mb-1">Go live in seconds</div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            Browser-only. No downloads, no plugins, no studio.
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <IconShare3 size={18} className="text-primary mb-2" />
          <div className="text-sm font-medium mb-1">Share one link</div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            Listeners tap and tune in. No app, no signup.
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <IconHeadphones size={18} className="text-primary mb-2" />
          <div className="text-sm font-medium mb-1">Talk over music</div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            Push-to-talk plus a drag-and-drop queue, like a DJ.
          </div>
        </div>
      </div>
    </div>
  )
}
