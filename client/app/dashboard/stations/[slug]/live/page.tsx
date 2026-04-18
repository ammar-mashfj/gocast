"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  IconCheck,
  IconX,
  IconLoader2,
  IconCircleDot,
  IconShare,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import api from "@/lib/axios"
import { shareOrCopy } from "@/lib/share"
import type { Station } from "@/interfaces/Station"
import type { BroadcastStepInfo, StepStatus } from "@/lib/broadcast"
import { env } from "@/lib/env"

function StepIcon({ status }: { status: StepStatus }) {
  const base = "size-5 rounded-full flex items-center justify-center shrink-0"
  if (status === "done") return <div className={`${base} bg-emerald-500/10 text-emerald-400`}><IconCheck size={12} /></div>
  if (status === "active") return <div className={`${base} bg-primary/10 text-primary`}><IconLoader2 size={12} className="animate-spin" /></div>
  if (status === "error") return <div className={`${base} bg-destructive/10 text-destructive`}><IconX size={12} /></div>
  return <div className={`${base} bg-muted`}><IconCircleDot size={10} className="text-muted-foreground" /></div>
}

function ConnectingView({ steps, error }: { steps: BroadcastStepInfo[]; error: string | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center text-center py-10">
        {error ? (
          <div className="size-12 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center mb-5">
            <IconX size={20} className="text-destructive" />
          </div>
        ) : (
          <IconLoader2 size={40} className="text-primary animate-spin mb-5" />
        )}

        <h2 className="text-base font-medium mb-2">
          {error ? "Connection failed" : "Going on air..."}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {error || "Setting up your broadcast"}
        </p>

        <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-2.5 text-sm ${
                step.status === "done" ? "text-emerald-400"
                  : step.status === "active" ? "text-primary"
                  : step.status === "error" ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              <StepIcon status={step.status} />
              {step.errorMessage || step.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SuccessView({ station, onOpenControls }: { station: Station; onOpenControls: () => void }) {
  const playerUrl = `${env.appUrl}/station/${station.slug}`

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
      <CardContent className="flex flex-col items-center text-center py-10">
        <div className="size-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <IconCheck size={24} className="text-emerald-400" />
        </div>

        <h2 className="text-lg font-medium text-emerald-400 mb-1.5">You're on air!</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Your station is now live. Share your link with your audience.
        </p>

        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted rounded-lg text-sm text-muted-foreground mb-5 max-w-full">
          <span className="truncate">{playerUrl}</span>
          <button
            onClick={() => shareOrCopy(playerUrl, station.name)}
            className="text-primary bg-transparent border-none cursor-pointer hover:text-primary/80 shrink-0"
          >
            <IconShare size={14} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
          <Button className="w-full sm:w-auto" onClick={onOpenControls}>Open broadcaster controls</Button>
          <Button className="w-full sm:w-auto" variant="outline" asChild>
            <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
              View player page
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function GoLivePage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const micDisabled = typeof window !== 'undefined' && (() => {
    try { return localStorage.getItem(`broadcast:micDisabled:${slug}`) === 'true' } catch { return false }
  })()
  const { state, steps, error, start } = useBroadcast()
  const [station, setStation] = useState<Station | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    api.get(`/stations/${slug}`)
      .then((res) => setStation(res.data.data))
      .catch(() => router.push("/dashboard"))
  }, [slug, router])

  useEffect(() => {
    if (!station || state !== "idle" || startedRef.current) return
    startedRef.current = true
    start(station.slug, { skipMic: micDisabled })
  }, [station, state, start, micDisabled])

  if (!station) return null

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div className="text-xs tracking-widest uppercase text-muted-foreground">
        {station.name} — Going live
      </div>

      {state === "live" ? (
        <SuccessView
          station={station}
          onOpenControls={() => router.push(`/dashboard/stations/${slug}/studio`)}
        />
      ) : (
        <ConnectingView steps={steps} error={error} />
      )}

      {state === "error" && (
        <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-center">
          <Button className="w-full sm:w-auto" onClick={() => { startedRef.current = false; start(station.slug, { skipMic: micDisabled }) }}>
            Try again
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" asChild>
            <Link href={`/dashboard/stations/${slug}`}>Go back</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
