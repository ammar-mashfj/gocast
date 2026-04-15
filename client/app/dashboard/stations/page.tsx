import { IconRadio } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import { Station } from "@/interfaces/Station"
import { StationCard } from "@/components/dashboard/StationCard"
import { CreateStationButton } from "@/components/dashboard/CreateStationButton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"

export default async function StationsPage() {
  const { data: stations } = await apiFetch<{ data: Station[] }>("/stations")

  if (stations.length === 0) {
    return (
      <Empty className="py-24">
        <EmptyMedia variant="icon">
          <IconRadio size={48} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle className="text-md">No stations yet</EmptyTitle>
          <EmptyDescription className="text-sm">Create your first station to start broadcasting.</EmptyDescription>
        </EmptyHeader>
        <CreateStationButton />
      </Empty>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium">Your stations</h1>
        <CreateStationButton />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {stations.map((station) => (
          <StationCard key={station.id} station={station} />
        ))}
      </div>
    </div>
  )
}
