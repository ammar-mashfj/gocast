"use client"

import { useEffect, useState } from "react"
import { useConfirm } from "@/components/ds/ConfirmDialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { SettingsTile } from "./SettingsTile"
import { ProTag } from "@/components/ds/Tag"
import { EncoderConnection, HowToConnectLink } from "@/components/dashboard/EncoderConnection"
import { useProCheckout } from "@/contexts/ProCheckoutContext"
import { StationEncoder } from "@/interfaces/Station"
import api from "@/lib/axios"
import { copyText } from "@/lib/clipboard"

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
 * "Use your own DJ software" on Station settings: where you find it, and
 * where the stream key is rotated. The values themselves and the live
 * connection feedback are on the Go live page (Use DJ software instead,
 * opened directly by Open Go live via ?dj=1), where connecting happens; two
 * copies of them were two things to keep in step. A key made here is shown
 * once, since pasting it is the only reason to make one.
 *
 * Free plans get the tile LOCKED, not hidden: it's a Pro selling point.
 */
export function EncoderCard({ slug, stationName, encoder, locked }: EncoderCardProps) {
  const [confirm, confirmDialog] = useConfirm()
  const router = useRouter()
  const checkout = useProCheckout()
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  /** A key was made in this dialog: show it, once, until the dialog closes. */
  const [justRotated, setJustRotated] = useState(false)
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
      setJustRotated(true)
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
      <SettingsTile
        id="encoder"
        title={
          <span className="inline-flex items-center gap-2">
            Use your own DJ software <ProTag />
          </span>
        }
        description="Go live from BUTT, Mixxx or RadioDJ instead of the browser."
        open={open}
        onOpenChange={setOpen}
      >
        <div className="flex flex-col items-start gap-4 text-body-sm text-muted-foreground">
          <p>
            Any software that can send to an Icecast server can go live on {stationName}, with its own server address and stream key, so you keep
            broadcasting with the tools you already know.
          </p>
          {/* Closed first: checkout is a dialog of its own. */}
          <Button
            variant="pro"
            size="lg"
            className="w-full"
            onClick={() => {
              setOpen(false)
              checkout.open()
            }}
          >
            Get Pro
          </Button>
        </div>
      </SettingsTile>
    )
  }

  return (
    // The id is an anchor: settings#encoder opens this (help pages link it).
    <SettingsTile
      id="encoder"
      title="Use your own DJ software"
      description="Optional. Skip this if you go live from the browser."
      dialogDescription={encoder ? <HowToConnectLink /> : undefined}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setJustRotated(false)
          setRevealed(false)
        }
      }}
    >
      {!encoder ? (
        // The plan allows it, but this deployment has no ingest router
        // published, so there is no honest address to print.
        <p className="text-body-sm text-muted-foreground">
          Own-software broadcasting isn’t available on this server yet. The browser studio still works for {stationName}.
        </p>
      ) : (
        // No values and no connection watching here: connecting happens on
        // the Go live page (Use DJ software instead), which has the values,
        // says if the station is off and confirms the connection. This is
        // where you find it, and where the key is rotated.
        <div className="flex flex-col gap-5 text-body-sm text-muted-foreground">
          <div className="flex flex-col items-start gap-3">
            <p>
              Connect from the Go live page: open Go live and choose{" "}
              <span className="font-semibold text-foreground">Use DJ software instead</span>. Your connection details are there.
            </p>
            <Button asChild>
              <Link href={`/dashboard/stations/${slug}/live?dj=1`}>Open Go live</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-foreground">Stream key</span>
                <span>Pasted it somewhere public? Make a new one.</span>
              </div>
              <Button size="sm" variant="ghost" onClick={rotate} disabled={rotating}>
                {rotating ? "Making a new key…" : "New key"}
              </Button>
            </div>
            {/* The only reason to rotate is to paste the new key, so it is
                shown here once, after a rotation in this dialog. */}
            {justRotated && password && (
              <KeyRow password={password} revealed={revealed} onToggleReveal={() => setRevealed((r) => !r)} />
            )}
          </div>
        </div>
      )}
      {confirmDialog}
    </SettingsTile>
  )
}

/**
 * The Go live page's DJ-software dialog body: the values to type into the
 * software. (Settings no longer shows them: it points to Go live and
 * rotates the key.)
 */
export function EncoderPanel({
  stationName,
  encoder,
  password,
  revealed,
  onToggleReveal,
}: {
  stationName: string
  encoder?: StationEncoder
  password: string | null
  revealed: boolean
  onToggleReveal: () => void
}) {
  return (
    <div className="text-body-sm text-muted-foreground">
      {!encoder ? (
        <p>Own-software broadcasting isn’t available on this server yet. The browser studio still works for {stationName}.</p>
      ) : (
        <EncoderConnection encoder={encoder} password={password} revealed={revealed} onToggleReveal={onToggleReveal} />
      )}
    </div>
  )
}

/** The freshly made key: masked, Show and Copy. */
function KeyRow({ password, revealed, onToggleReveal }: { password: string; revealed: boolean; onToggleReveal: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1 rounded-control bg-surface-inset px-3.5 py-2.5">
      <div className="flex min-h-8.5 items-center gap-3">
        <span className="w-20 shrink-0 eyebrow-sm text-text-faint">New key</span>
        <span className="min-w-0 flex-1 font-mono text-body-sm break-all text-foreground">{revealed ? password : "•".repeat(16)}</span>
        <Button size="sm" variant="quiet" onClick={onToggleReveal} aria-label={revealed ? "Hide stream key" : "Show stream key"}>
          {revealed ? "Hide" : "Show"}
        </Button>
        <Button
          size="sm"
          variant="subtle"
          aria-label="Copy stream key"
          onClick={async () => {
            if (await copyText(password)) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            } else toast.error("Couldn't copy — select the key and copy it manually")
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-caption text-text-faint">Your software keeps working until it reconnects; then it needs this key.</p>
    </div>
  )
}
