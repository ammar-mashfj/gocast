"use client"

import { useEncoderLocked } from "@/contexts/AccountContext"
import { Station } from "@/interfaces/Station"
import { EncoderCard } from "./EncoderCard"

/**
 * Reads the plan off the dashboard's account context so the settings page
 * itself can stay a server component with a single station fetch.
 *
 * The split matters: `station.encoder` is absent for three unrelated reasons
 * (wrong plan, not the owner, no ingest router deployed) and only the plan
 * flag can tell the first apart from the third. Asking the API a second time
 * for the user would be a round trip for something the layout already has.
 */
export function EncoderSection({ station }: { station: Station }) {
  const locked = useEncoderLocked()

  return (
    <EncoderCard
      slug={station.slug}
      stationName={station.name}
      encoder={station.encoder}
      locked={locked}
    />
  )
}
