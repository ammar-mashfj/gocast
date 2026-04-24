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
  IconRefresh,
  IconMicrophoneOff,
  IconMicrophone,
  IconMusic,
  IconBroadcast,
  IconLink,
  IconSettings,
} from "@tabler/icons-react"
import { useBroadcast, readBroadcastRecovery, clearBroadcastRecovery } from "@/contexts/BroadcastContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import api from "@/lib/axios"
import { shareOrCopy } from "@/lib/share"
import type { Station } from "@/interfaces/Station"
import type { BroadcastStepInfo, StepStatus } from "@/lib/broadcast"
import { env } from "@/lib/env"

// If a refresh happens within this window of the last broadcast, we treat it
// as accidental and offer to resume rather than auto-restarting.
const RECOVERY_WINDOW_MS = 60_000

function StepIcon({ status }: { status: StepStatus }) {
  const base = "size-5 rounded-full flex items-center justify-center shrink-0"
  if (status === "done") return <div className={`${base} bg-emerald-500/10 text-emerald-400`}><IconCheck size={14} /></div>
  if (status === "active") return <div className={`${base} bg-primary/10 text-primary`}><IconLoader2 size={14} className="animate-spin" /></div>
  if (status === "error") return <div className={`${base} bg-destructive/10 text-destructive`}><IconX size={14} /></div>
  return <div className={`${base} bg-muted`}><IconCircleDot size={10} className="text-muted-foreground" /></div>
}

function ConnectingView({ steps, error }: { steps: BroadcastStepInfo[]; error: string | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center text-center py-10">
        {error ? (
          <div className="size-12 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center mb-5">
            <IconX size={18} className="text-destructive" />
          </div>
        ) : (
          <IconLoader2 size={48} className="text-primary animate-spin mb-5" />
        )}

        <h2 className="text-base font-medium mb-2">
          {error ? "Connection failed" : "Going on air…"}
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

interface PreflightViewProps {
  station: Station
  micDisabled: boolean
  onMicDisabledChange: (disabled: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Shown before the broadcast starts. Gives the user a calm, explicit checklist
 * of what's about to happen (which station, whether the mic will be captured,
 * where listeners will tune in) so the first broadcast doesn't feel like "one
 * accidental click and I'm on air."
 *
 * The mic toggle is live here — it's the last chance to swap between
 * mic+music and music-only without going back to the station page.
 */
function PreflightView({ station, micDisabled, onMicDisabledChange, onConfirm, onCancel }: PreflightViewProps) {
  const playerUrl = `${env.appUrl}/station/${station.slug}`
  const micOn = !micDisabled

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-8">
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
            <IconBroadcast size={20} className="text-primary" />
          </div>
          <h2 className="text-base font-medium">You&apos;re about to go live on</h2>
          <p className="text-lg font-semibold">{station.name}</p>
        </div>

        <ul className="flex flex-col gap-3 text-sm" role="list">
          <li className="flex items-start gap-3">
            <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              {micOn
                ? <IconMicrophone size={15} className="text-emerald-400" />
                : <IconMusic size={15} className="text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-foreground font-medium">
                  {micOn ? "Microphone + music" : "Music only"}
                </span>
                <button
                  type="button"
                  onClick={() => onMicDisabledChange(!micDisabled)}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
                >
                  {micOn ? "Mute mic" : "Enable mic"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {micOn
                  ? "Your browser will ask for permission once you start."
                  : "No mic permission prompt. Queue will broadcast on its own."}
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <IconLink size={15} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-foreground font-medium">Listeners tune in at</div>
              <div className="text-xs text-muted-foreground truncate">{playerUrl}</div>
            </div>
          </li>
        </ul>

        <div className="flex flex-col sm:flex-row-reverse gap-2.5">
          <Button className="w-full sm:flex-1" onClick={onConfirm}>
            <IconBroadcast size={15} data-icon="inline-start" />
            Go live
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
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

        <h2 className="text-lg font-medium text-emerald-400 mb-1.5">You&apos;re on air</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Send this link so listeners can tune in:
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

function AlreadyLiveView({ station }: { station: Station }) {
  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.03]">
      <CardContent className="flex flex-col items-center text-center py-10">
        <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <IconBroadcast size={18} className="text-amber-400" />
        </div>
        <h2 className="text-base font-medium mb-2">This station is already live</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Another browser or device is currently broadcasting. Stop that broadcast before starting a new one here.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
          <Button className="w-full sm:w-auto" asChild>
            <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
              <IconLink size={15} data-icon="inline-start" />
              View player
            </a>
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" asChild>
            <Link href={`/dashboard/stations/${station.slug}`}>Back to station</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function isMicPermissionError(message: string | null): boolean {
  if (!message) return false
  return /microphone access denied|no microphone found/i.test(message)
}

export default function GoLivePage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug
  const { state, steps, error, start, engine } = useBroadcast()
  const [station, setStation] = useState<Station | null>(null)
  const [micDisabled, setMicDisabled] = useState(false)
  // `prompting` blocks the auto-start until the user resolves the recovery prompt.
  const [prompting, setPrompting] = useState<null | "recover">(null)
  // Explicit user confirmation from the pre-flight screen. Keeps "I landed on
  // this page" from ever meaning "mic is now hot."
  const [preflightApproved, setPreflightApproved] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    try {
      setMicDisabled(localStorage.getItem(`broadcast:micDisabled:${slug}`) === "true")
    } catch {
      // localStorage blocked (private mode, quota) — default to mic enabled.
    }
  }, [slug])

  // If we just survived a refresh while broadcasting, surface a recovery card
  // instead of silently restarting the broadcast.
  useEffect(() => {
    const record = readBroadcastRecovery()
    if (record && record.stationSlug === slug && Date.now() - record.startedAt < RECOVERY_WINDOW_MS) {
      setPrompting("recover")
      // The record's micDisabled is the user's previous preference; honor it.
      setMicDisabled(record.micDisabled)
      // Block auto-start until they choose.
      startedRef.current = true
    } else if (record) {
      clearBroadcastRecovery()
    }
  }, [slug])

  useEffect(() => {
    api.get(`/stations/${slug}`)
      .then((res) => setStation(res.data.data))
      .catch(() => router.push("/dashboard"))
  }, [slug, router])

  useEffect(() => {
    // Pre-flight gate: only start the broadcast once the user has explicitly
    // approved on the pre-flight screen. Recovery uses its own button and
    // also sets startedRef, so this effect won't double-fire.
    if (!station || state !== "idle" || startedRef.current || !preflightApproved) return
    startedRef.current = true
    start(station.slug, { skipMic: micDisabled })
  }, [station, state, start, micDisabled, preflightApproved])

  // Skeleton while we fetch the station — same shape as the connecting view
  // so the swap is barely perceptible.
  if (!station) {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <Skeleton className="h-3 w-40" />
        <Card>
          <CardContent className="flex flex-col items-center text-center py-10 gap-5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Recovery card — shown when sessionStorage indicates a broadcast was active just before the page loaded.
  if (prompting === "recover" && state === "idle") {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div className="text-xs tracking-widest uppercase text-muted-foreground">
          {station.name} — Recover broadcast
        </div>
        <Card className="border-amber-500/20 bg-amber-500/[0.03]">
          <CardContent className="flex flex-col items-center text-center py-10">
            <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <IconRefresh size={18} className="text-amber-400" />
            </div>
            <h2 className="text-base font-medium mb-2">You were broadcasting before this page reloaded</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              The connection dropped during the refresh. Resume to start a fresh broadcast for this station, or end the session.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  clearBroadcastRecovery()
                  setPrompting(null)
                  startedRef.current = false
                  start(station.slug, { skipMic: micDisabled })
                }}
              >
                Resume broadcast
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => {
                  clearBroadcastRecovery()
                  router.push(`/dashboard/stations/${slug}`)
                }}
              >
                End session
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (station.is_live && state === "idle") {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div className="text-xs tracking-widest uppercase text-muted-foreground">
          {station.name} — Already live
        </div>
        <AlreadyLiveView station={station} />
      </div>
    )
  }

  // Mic-blocked recovery view (#11) — surface explicit options when the OS/browser denies mic.
  const micBlocked = state === "error" && isMicPermissionError(error) && !micDisabled

  // Header label tracks the actual phase — shows "Pre-flight" while the user
  // is still deciding, "Going live" once they've approved and connection is
  // in flight, and nothing during error recovery.
  const headerLabel = (() => {
    if (state === "live") return "On air"
    if (!preflightApproved && state === "idle") return "Pre-flight"
    return "Going live"
  })()

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      <div className="text-xs tracking-widest uppercase text-muted-foreground">
        {station.name} — {headerLabel}
      </div>

      {state === "live" ? (
        <SuccessView
          station={station}
          onOpenControls={async () => {
            await engine?.resume()
            router.push(`/dashboard/stations/${slug}/studio`)
          }}
        />
      ) : !preflightApproved && state === "idle" ? (
        <PreflightView
          station={station}
          micDisabled={micDisabled}
          onMicDisabledChange={(next) => {
            setMicDisabled(next)
            try { localStorage.setItem(`broadcast:micDisabled:${slug}`, String(next)) } catch {}
          }}
          onConfirm={() => setPreflightApproved(true)}
          onCancel={() => router.push(`/dashboard/stations/${slug}`)}
        />
      ) : (
        <ConnectingView steps={steps} error={error} />
      )}

      {micBlocked && (
        <Card className="border-amber-500/20 bg-amber-500/[0.03]">
          <CardContent className="flex flex-col items-center text-center py-8 gap-4">
            <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <IconMicrophoneOff size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">Microphone access blocked</h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                Allow mic access in your browser settings, or broadcast music-only without the mic.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  try { localStorage.setItem(`broadcast:micDisabled:${slug}`, "true") } catch {}
                  setMicDisabled(true)
                  startedRef.current = false
                  start(station.slug, { skipMic: true })
                }}
              >
                <IconMicrophoneOff size={14} data-icon="inline-start" />
                Continue without mic
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => { startedRef.current = false; start(station.slug, { skipMic: false }) }}
              >
                <IconSettings size={14} data-icon="inline-start" />
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {state === "error" && !micBlocked && (
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
