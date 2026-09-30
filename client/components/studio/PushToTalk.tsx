"use client"

import { useCallback, useEffect } from "react"
import { IconLock, IconLockOpen, IconMicrophone } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MicMeter } from "./MicMeter"
import { MicSettings } from "./MicSettings"
import { useCoarsePointer } from "@/lib/useCoarsePointer"

/** True when a key event belongs to a field the broadcaster is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag !== "INPUT") return false
  const type = (target as HTMLInputElement).type
  return !["button", "checkbox", "radio", "range", "submit", "reset"].includes(type)
}

/**
 * True when a key event lands on a control that owns Space and letters for
 * itself: a dialog, a toast, an open menu or listbox (Space selects an item,
 * letters are type-ahead), or a running-order drag handle (Space picks the
 * track up and drops it). The studio's talk key and shortcuts must not reach
 * past them — Space on "Keep going" in the End broadcast dialog used to open
 * the mic and swallow the click, and reordering by keyboard keyed the mic on
 * both the pick-up and the drop.
 */
export function isOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], [role="listbox"], [data-sonner-toaster], [aria-roledescription="sortable"]',
  )
}

/**
 * The mic strip: talk pad, level meter, latch, mic settings.
 *
 * Space is push-to-talk wherever focus sits, except inside a text field. It
 * used to fire only with focus on the page body or a button, and pressing
 * Space on a focused button ALSO clicked it on keyup — holding Space to talk
 * while "Next track" had focus skipped the song under your voice. Both are
 * handled here: the keyup is swallowed when it would activate a button.
 *
 * The pad uses pointer events only, with capture, so a finger or cursor that
 * slides off the pad keeps the mic open until it lifts — and a touch can no
 * longer fire the mouse handlers a second time.
 */
export function PushToTalk() {
  const { engine, micStream, micDisabled } = useBroadcast()
  useEngineVersion(engine)

  const touch = useCoarsePointer()
  const micOpen = engine?.isMicActive() ?? false
  const latched = engine?.isMicLatched() ?? false
  const musicHint = engine?.getMicPrefs().duck === "silence" ? "music fades out while you talk" : "music dips while you talk"

  const down = useCallback(() => engine?.pttDown(), [engine])
  const up = useCallback(() => engine?.pttUp(), [engine])

  useEffect(() => {
    if (micDisabled || !engine) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target) || isOverlayTarget(e.target)) return
      e.preventDefault()
      down()
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" || isTypingTarget(e.target)) return
      // Still release inside a dialog — the key may have gone down before it
      // opened — but leave its button's click alone.
      if (isOverlayTarget(e.target)) {
        up()
        return
      }
      // A focused button activates on Space keyup; the talk key must not
      // double as a click on whatever happens to have focus.
      e.preventDefault()
      up()
    }
    // A Space keyup that lands in another window never reaches us: holding
    // the key and Alt-Tabbing away left the mic open and the music ducked.
    // Latched mics are untouched — pttUp() is a no-op while latched.
    function onLeave() {
      if (document.visibilityState === "hidden" || !document.hasFocus()) up()
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onLeave)
    document.addEventListener("visibilitychange", onLeave)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onLeave)
      document.removeEventListener("visibilitychange", onLeave)
    }
  }, [engine, micDisabled, down, up])

  if (micDisabled) return null

  const device = micStream?.getAudioTracks()[0]?.label || "Default microphone"

  return (
    // Laid out by the width of the deck (`@container/talk` in OnAirDeck), not
    // the viewport: at 1366px the desktop console still only gives this row
    // ~680px, and three columns squeezed the meter to 100px so its caption
    // wrapped four deep. Narrower than 52rem the talk pad takes the top row
    // and the meter and mic buttons share the one beneath. Narrower than
    // 30rem (a phone) it is three rows: talk pad, then the mic buttons right
    // under it, then the meter across the full width — beside the buttons it
    // was a 130px sliver with its caption stranded above.
    <div className="grid grid-cols-1 items-center gap-x-5 gap-y-3 transition-colors duration-200 @[30rem]/talk:grid-cols-[minmax(0,1fr)_auto] @[52rem]/talk:grid-cols-[minmax(220px,auto)_minmax(0,1fr)_auto]">
      <button
        type="button"
        aria-pressed={micOpen}
        aria-keyshortcuts="Space"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          down()
        }}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.repeat) {
            e.preventDefault()
            down()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter") up()
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "flex min-h-[72px] touch-none select-none items-center gap-3.5 rounded-xl border px-5 text-left transition-[background-color,border-color,color,transform] duration-150 @[30rem]/talk:col-span-2 @[52rem]/talk:col-span-1",
          micOpen
            ? "scale-[0.99] border-mic bg-mic text-[#04121c]"
            : "border-white/12 bg-white/[0.03] text-foreground hover:border-white/20 hover:bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            micOpen ? "bg-[#04121c]/15" : "bg-mic/12 text-mic-text",
          )}
        >
          <IconMicrophone size={20} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-semibold leading-tight">
            {micOpen ? (latched ? "Mic stays on" : "You're on mic") : "Hold to talk"}
          </span>
          <span className={cn("text-xs", micOpen ? "text-[#04121c]/75" : "text-muted-foreground")}>
            {micOpen
              ? latched
                ? "Press Mic off to close"
                : "Let go to close"
              : touch
                ? `Press and hold · ${musicHint}`
                : `Hold Space · ${musicHint}`}
          </span>
        </span>
      </button>

      <div className="order-last flex min-w-0 flex-col gap-2 @[30rem]/talk:order-none">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className={cn("shrink-0 whitespace-nowrap", micOpen ? "font-medium text-mic-text" : "text-muted-foreground")}>
            {micOpen ? "Going out live" : "Mic check · listeners can't hear this"}
          </span>
          {/* The device name is the first thing to go: sharing this line at
              the three-column minimum it pushed the caption onto two rows. */}
          <span className="hidden min-w-0 truncate text-muted-foreground @[64rem]/talk:inline">{device}</span>
        </div>
        <MicMeter stream={micStream} open={micOpen} />
      </div>

      <div className="flex items-center gap-2 self-center">
        <Button
          variant="outline"
          aria-pressed={latched}
          aria-keyshortcuts="L"
          title="Leave the mic on without holding anything (L)"
          onClick={() => engine?.setMicLatched(!latched)}
          className={cn("h-11 flex-1 self-center @[30rem]/talk:flex-initial", latched && "border-mic/50 bg-mic/10 text-mic-text hover:bg-mic/15 hover:text-mic-text")}
        >
          {latched ? <IconLockOpen data-icon="inline-start" /> : <IconLock data-icon="inline-start" />}
          <span>{latched ? "Mic off" : "Keep mic on"}</span>
        </Button>
        <MicSettings />
      </div>
    </div>
  )
}
