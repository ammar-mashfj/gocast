"use client"

import { IconLoader2 } from "@tabler/icons-react"
import type { useMicPreview } from "@/hooks/useMicPreview"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { Notice } from "@/components/ds/Notice"
import { Select } from "@/components/ds/Select"
import { MicMeter } from "@/components/studio/MicMeter"

/**
 * Pick the microphone and hear-check it before the show — the only time it
 * can be changed: the engine can't swap mics on air. The meter draws in its
 * grey "check" colour because none of this is going out.
 */
export function MicCheckCard({ mic, onMusicOnly }: { mic: ReturnType<typeof useMicPreview>; onMusicOnly: () => void }) {
  if (mic.state === "blocked") {
    return (
      <Notice
        label="Mic blocked"
        actions={
          <>
            <Button size="lg" onClick={() => void mic.open()}>Try again</Button>
            <Button size="lg" variant="ghost" onClick={onMusicOnly}>Go live with music only</Button>
          </>
        }
      >
        This browser isn’t allowed to use your microphone. Allow it for this site in your browser’s settings, then try again.
      </Notice>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Your microphone"
        description={mic.state === "on" ? "Say something. The bars should move." : "Check it before you go on air. Nothing goes out yet."}
      />
      {mic.state === "on" ? (
        <>
          {mic.devices.length > 1 && (
            <Select
              aria-label="Microphone"
              value={mic.current}
              onChange={(id) => void mic.choose(id)}
              options={mic.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))}
            />
          )}
          <MicMeter stream={mic.stream} open={false} className="text-muted-foreground" />
        </>
      ) : mic.state === "none" ? (
        <p className="text-sm text-fault-text">No microphone found. Plug one in and try again, or go live with music only.</p>
      ) : (
        <Button variant="subtle" className="self-start" onClick={() => void mic.open()} disabled={mic.state === "opening"}>
          {mic.state === "opening" && <IconLoader2 className="animate-spin" />}
          Check your mic
        </Button>
      )}
      {mic.state === "none" && (
        <Button variant="subtle" className="self-start" onClick={() => void mic.open()}>Try again</Button>
      )}
    </Card>
  )
}
