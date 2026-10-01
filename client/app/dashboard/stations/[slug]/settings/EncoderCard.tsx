"use client"

import { useEffect, useState } from "react"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { Disclosure } from "@/components/ds/Disclosure"
import { ProTag } from "@/components/ds/Tag"
import { EncoderConnection } from "@/components/dashboard/EncoderConnection"
import { useProRequest } from "@/contexts/ProRequestContext"
import { StationEncoder } from "@/interfaces/Station"
import api from "@/lib/axios"

interface EncoderCardProps {
  slug: string
  stationName: string
  /**
   * Undefined means the API withheld it, which is three different facts the
   * card has to tell apart: the plan does not include the encoder, the account
   * is not the owner (impossible on this page), or no ingest router is
   * deployed here. `encoderLocked` separates the first from the third.
   */
  encoder?: StationEncoder
  /** The plan does not include external encoders. */
  locked: boolean
}

/**
 * Everything a DJ types into BUTT, Mixxx or RadioDJ.
 *
 * It is a settings CARD rather than a dialog because it is not a one-off: the
 * same five values get retyped on a second machine, after a reinstall, and
 * whenever somebody's encoder forgets them. That is also why the key is
 * redisplayed rather than shown once — see the migration that added the
 * column.
 *
 * The prose here is not decoration. Every line of it is a support ticket that
 * has already been paid for somewhere: the wrong server type, a station that
 * is switched off, and a rotation that did not kick the person who was on air.
 */
export function EncoderCard({ slug, stationName, encoder, locked }: EncoderCardProps) {
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()
  const proRequest = useProRequest()
  const [revealed, setRevealed] = useState(false)
  const [rotating, setRotating] = useState(false)
  /**
   * The key the rotate endpoint just handed back, held only until the
   * server-rendered `encoder` prop catches up.
   *
   * Without it the card shows the OLD key for as long as router.refresh()
   * takes — and that is the one moment somebody is looking straight at the
   * field to copy it, having just been told a new one exists. Pasting the old
   * value into BUTT fails at the next reconnect with no clue why.
   *
   * Carries the server's `rotated_at` alongside the key, because the override
   * needs to know whether an arriving prop is NEWER than it or older. See the
   * effect below.
   */
  const [rotated, setRotated] = useState<{ key: string | null; at: string | null } | null>(null)

  // Lift the override once the props have caught up — otherwise this component
  // would pin one value forever and never show a key rotated somewhere else.
  //
  // Compared by `rotated_at` rather than by the key itself, because "caught up"
  // is a question about ORDER and the key is just an opaque string. Two
  // rotations in quick succession put two router.refresh() calls in flight and
  // they can land out of order: clearing on any prop change would drop back to
  // the first refresh's now-dead key, while clearing only on an exact key match
  // would ignore a rotation from another tab forever. A timestamp answers both
  // — anything at or after ours supersedes it, anything before it is a stale
  // refresh still in flight.
  useEffect(() => {
    if (
      rotated !== null &&
      encoder?.rotated_at &&
      (rotated.at === null || encoder.rotated_at >= rotated.at)
    ) {
      setRotated(null)
    }
  }, [encoder?.rotated_at, rotated])

  async function rotate() {
    if (rotating) return
    const ok = await confirm({
      title: "Generate a new stream key?",
      description: "Your encoders keep working until they next reconnect, and then they need the new key.",
      confirmLabel: "Generate new key",
      keepLabel: "Keep current key",
    })
    if (!ok) return

    setRotating(true)
    try {
      // The response already carries the new station payload, so the key is
      // in hand before router.refresh() has even been issued. Reading it here
      // rather than waiting for the refetch is what keeps the field from
      // showing the old value while the toast says there is a new one.
      const res = await api.post<{
        data?: { encoder?: { password?: string | null; rotated_at?: string | null } }
      }>(`/stations/${slug}/stream-key`)
      setRotated({
        key: res.data?.data?.encoder?.password ?? null,
        at: res.data?.data?.encoder?.rotated_at ?? null,
      })
      // Reveal it: the only reason to rotate is to go and paste the new one.
      setRevealed(true)
      toast.success("New stream key generated")
      router.refresh()
    } catch {
      toast.error("Couldn't generate a new key")
    } finally {
      setRotating(false)
    }
  }

  const password = rotated ? rotated.key : encoder?.password ?? null

  // Free plans get the fold LOCKED, not hidden: it's a Pro selling point, and
  // a feature nobody can see sells nothing.
  if (locked) {
    return (
      <Disclosure
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            Use your own DJ software <ProTag />
          </span>
        }
        description="Go live from BUTT, Mixxx or RadioDJ instead of the browser."
      >
        <div className="flex flex-col items-start gap-3">
          <p>
            Any software that can send to an Icecast server can go live on {stationName}, with its own server address and stream key, so you keep
            broadcasting with the tools you already know.
          </p>
          {/* "Request", not "Upgrade" — Pro is granted by hand. */}
          <Button variant="pro" onClick={proRequest.open} disabled={proRequest.requested}>
            {proRequest.requested ? "Request sent" : "Request Pro"}
          </Button>
        </div>
      </Disclosure>
    )
  }

  return (
    <Disclosure variant="card" title="Use your own DJ software" description="Optional. Skip this if you go live from the browser.">
      {!encoder ? (
        // The plan allows it, but this deployment has no ingest router
        // published, so there is no honest address to print.
        <p>Own-software broadcasting isn’t available on this server yet. The browser studio still works for {stationName}.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p>
            Pick <span className="font-semibold text-foreground">Icecast 2</span> as the server type and fill in these five values. Works with BUTT,
            Mixxx, RadioDJ, Audio Hijack and ffmpeg.
          </p>

          <EncoderConnection encoder={encoder} password={password} revealed={revealed} onToggleReveal={() => setRevealed((r) => !r)} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body-sm text-text-faint">Pasted your key somewhere public? Make a new one.</span>
            <Button size="sm" variant="ghost" onClick={rotate} disabled={rotating}>
              {rotating ? "Making a new key…" : "New key"}
            </Button>
          </div>

          {/* Each of these is a support conversation that happens without it. */}
          <div className="flex flex-col gap-1.5">
            {TIPS.map((tip) => (
              <Disclosure key={tip.q} title={tip.q}>
                {tip.a}
              </Disclosure>
            ))}
          </div>

          {/* New tab, like every help link — see HelpLink. */}
          <Link
            href="/help/my-encoder-wont-connect"
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Still not connecting? Five things cause nearly all of it →
          </Link>
        </div>
      )}
      {confirmDialog}
    </Disclosure>
  )
}

const TIPS = [
  {
    q: "Turn the station on first?",
    a: "Yes. Press Start AutoDJ on the Overview, then connect. Your software connects to the station itself, so there’s nothing to connect to while it’s off air.",
  },
  {
    q: "Shoutcast doesn’t work?",
    a: "Shoutcast can’t send the Mount value, so it never reaches your station. Choose Icecast 2 even if your software defaults to Shoutcast.",
  },
  {
    q: "Does a new key kick me off?",
    a: "No. A show already on air keeps running; the new key applies the next time your software connects. To cut someone off now, turn the station off on the Overview, then make a new key here so they can’t reconnect.",
  },
  {
    q: "Is this connection private?",
    a: "It isn’t encrypted. Your software sends the key as plain text, so treat it like a password on a shared network, and make a new one if you ever paste it somewhere public.",
  },
]
