"use client"

import dynamic from "next/dynamic"
import type { Station } from "@/interfaces/Station"
import { PlayerSkeleton } from "./PlayerSkeleton"

// IcecastMetadataPlayer pulls in Node-only worker code that breaks SSR; we
// also use this dynamic boundary as a clean place to render a skeleton
// matching the player's real layout while the heavy module loads.
const PlayerView = dynamic(() => import("./PlayerView").then((m) => m.PlayerView), {
  ssr: false,
  loading: () => <PlayerSkeleton />,
})

interface PlayerViewClientProps {
  station: Station
  isOwner: boolean
}

export default function PlayerViewClient({ station, isOwner }: PlayerViewClientProps) {
  return <PlayerView station={station} isOwner={isOwner} />
}
