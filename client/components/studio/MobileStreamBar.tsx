"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  IconPlayerStopFilled,
  IconShare,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"
import { shareOrCopy } from "@/lib/share"
import api from "@/lib/axios"
import type { Station } from "@/interfaces/Station"
import { formatClock } from "@/lib/format"

interface MobileStreamBarProps {
  stationId: string
}

export function MobileStreamBar({ stationId }: MobileStreamBarProps) {
  const router = useRouter()
  const { state, stop } = useBroadcast()
  // Same rule as the desktop panel: without AutoDJ there is nothing to hand
  // the station over to, so ending the broadcast ends the airtime as well.
  const autoDjLocked = useAutoDjLocked()
  const [elapsed, setElapsed] = useState(0)
  const [ending, setEnding] = useState(false)
  const [station, setStation] = useState<Station | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    api.get(`/stations/${stationId}`).then((res) => setStation(res.data.data))
  }, [stationId])

  useEffect(() => {
    if (state !== "live") return
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [state])

  const playerUrl = station ? `${env.appUrl}/station/${station.slug}` : ""

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b lg:hidden">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="size-1.5 bg-emerald-400 rounded-full shrink-0" />
        <span className="text-xs font-medium tabular-nums">{formatClock(elapsed)}</span>
      </div>

      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        {playerUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => shareOrCopy(playerUrl, station?.name)}
          >
            <IconShare size={16} />
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs px-2.5"
          disabled={ending}
          onClick={async () => {
            if (ending) return
            setEnding(true)
            try {
              await stop({ releaseStation: autoDjLocked })
              router.push(`/dashboard/stations/${stationId}`)
              router.refresh()
            } finally {
              setEnding(false)
            }
          }}
        >
          <IconPlayerStopFilled size={14} />
          {ending ? "Ending…" : "End"}
        </Button>
      </div>
    </div>
  )
}
