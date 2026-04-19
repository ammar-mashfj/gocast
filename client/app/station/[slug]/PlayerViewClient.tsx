"use client"

import dynamic from "next/dynamic"
import type { Station } from "@/interfaces/Station"

const PlayerView = dynamic(
  () => import("./PlayerView").then((m) => m.PlayerView),
  { ssr: false },
)

export default function PlayerViewClient({ station }: { station: Station }) {
  return <PlayerView station={station} />
}
