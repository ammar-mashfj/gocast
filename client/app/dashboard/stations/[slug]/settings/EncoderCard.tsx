"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconLoader2, IconRefresh, IconSparkles } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    if (
      !confirm(
        "Generate a new stream key?\n\nYour encoders will keep working until they next reconnect, and then they'll need the new key.",
      )
    ) {
      return
    }

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

  // Free plans get the card LOCKED, not hidden. It is a Pro selling point, and
  // a feature nobody can see sells nothing — the same call StationShare makes
  // for the embed.
  if (locked) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">
            Broadcast from your own software
            <Badge variant="secondary" className="ml-2 text-[9px] align-middle">PRO</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Go live from BUTT, Mixxx, RadioDJ, Audio Hijack — anything that speaks
            the Icecast 2 source protocol — instead of the browser studio. Your
            station gets its own server address and stream key, and you can keep
            broadcasting with the tools you already know.
          </p>
          <div>
            <Button variant="outline" onClick={proRequest.open}>
              <IconSparkles size={16} data-icon="inline-start" />
              {proRequest.requested ? "Request sent" : "Request access"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // The plan allows it, but this deployment has no ingest router published, so
  // there is no honest address to print.
  if (!encoder) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Broadcast from your own software</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            External encoder ingest isn&apos;t available on this server yet. The
            browser studio still works for {stationName}.
          </p>
        </CardContent>
      </Card>
    )
  }

  // The server holds a key it can no longer decrypt — an APP_KEY rotation.
  // Everything else on the card is still correct and still worth showing; only
  // the credential is gone, and "New key" above mints a working one.
  // The just-rotated value wins until the prop catches up. It is also the way
  // out of the unreadable-key state EncoderConnection renders: rotating mints
  // a key the server CAN read, and the card has to stop saying otherwise the
  // moment it does.
  //
  // A ternary rather than `rotated.key ?? encoder.password`, so that once a
  // rotation has happened the old key can never come back on screen. It is
  // dead — the server replaced it — and "Unavailable" is a worse answer than a
  // working key but a much better one than a credential that will fail at the
  // next reconnect with nothing to explain why. Only reachable if the rotate
  // response somehow carried no key at all, which minting one makes impossible.
  const password = rotated ? rotated.key : encoder.password

  return (
    <Card id="encoder" className="scroll-mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Broadcast from your own software</CardTitle>
        <Button variant="ghost" size="sm" onClick={rotate} disabled={rotating}>
          {rotating ? (
            <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
          ) : (
            <IconRefresh size={14} data-icon="inline-start" />
          )}
          New key
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Set your encoder&apos;s server type to{" "}
          <span className="text-foreground font-medium">Icecast 2</span> and fill in
          these five values. Works with BUTT, Mixxx, RadioDJ, Audio Hijack, ffmpeg —
          anything that speaks the Icecast source protocol.
        </p>

        <EncoderConnection
          encoder={encoder}
          password={password}
          revealed={revealed}
          onToggleReveal={() => setRevealed((r) => !r)}
        />

        {/* Each of these is a support conversation that happens without it. */}
        <ul className="border-t border-border pt-4 flex flex-col gap-2 list-none p-0 m-0 text-xs text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Switch {stationName} on first.</span>{" "}
            Your encoder connects to the station itself, so there is nothing
            listening while it is off air.
          </li>
          <li>
            <span className="text-foreground">Not Shoutcast.</span> The Shoutcast
            handshake has no room for a mount, so it cannot be routed to your
            station. Pick Icecast 2 even if your encoder defaults to the other.
          </li>
          <li>
            <span className="text-foreground">A new key doesn&apos;t kick anyone off.</span>{" "}
            A broadcast already on air keeps running; the new key applies the next
            time an encoder connects. To cut one off now, take the station off
            air and confirm — then come back here for a new key so whoever was
            broadcasting cannot reconnect.
          </li>
          <li>
            <span className="text-foreground">This connection isn&apos;t encrypted.</span>{" "}
            The Icecast source protocol sends your key as plain HTTP basic auth
            over a plain TCP connection. Treat it like a password on a shared
            network, and generate a new one if you ever paste it somewhere public.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
