"use client"

import { useCallback, useEffect } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { cn } from "@/lib/utils"
import { MicMeter } from "./MicMeter"
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
 * The talk pad, as the mobile studio draws it (Console.tsx `TalkPad`): one
 * big card that is the button, with the level meter inside it. It turns
 * solid red with dark ink while the mic is open. The latch and mic settings
 * sit in the row under it (StudioControls).
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
  const fades = engine?.getMicPrefs().duck === "silence"
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
  const look = micOpen
    ? {
        title: latched ? "Mic open" : "You\u2019re on",
        hint: latched ? "Press L, or switch off Keep mic open, to close it" : "Let go to close the mic",
      }
    : {
        title: "Hold here to talk",
        hint: `${touch ? "Press and hold anywhere here." : "Hold Space, or press and hold here."} The music ${fades ? "fades out" : "dips"} while you talk.`,
      }

  return (
    // The pad you hold, and the mic check under it.
    <div className="flex flex-col gap-2.5">
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
          "flex min-h-72 w-full touch-none select-none flex-col justify-between gap-4 rounded-hero p-6 text-left transition-colors duration-150",
          // Holding Space (or clicking) focuses the pad, and the global focus
          // style drew a white outline round it the whole time you talked.
          // The ring is for finding the pad by keyboard, so it shows only
          // then, and never while the mic is open.
          "outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-0",
          // Idle it is a plain card like the design system's, set apart by the
          // marker below and a faint red edge on hover: a preview of what
          // pressing does. Red fills it only while the mic is open.
          //
          // The grille: a fine dot grid, like the mesh over a microphone, so
          // the pad reads as the mic itself and not as another panel. It is
          // the one patterned surface in the studio (the design system keeps
          // surfaces solid; this is a deliberate exception, docs/DASHBOARD-
          // DESIGN-SYSTEM-ROLLOUT.md). Warm grey idle, the red's ink when open
          // (the `grille` utilities in app/dashboard.css).
          micOpen
            ? "bg-live grille-live text-live-ink"
            : "bg-card grille text-foreground hover:inset-ring-2 hover:inset-ring-live/35",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-display">{look.title}</span>
          {/* The design system's `trailing` slot. A red dot marks the control
              that puts you on air, as it does on Go live. */}
          {!micOpen && (
            <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full bg-live" />
              Live while held
            </span>
          )}
        </span>
        <span className={cn("text-sm font-medium", micOpen ? "text-live-ink/70" : "text-muted-foreground")}>
          {look.hint}
        </span>
      </button>

      <section
        aria-label="Mic check"
        className="flex flex-col gap-3 rounded-card bg-card p-5 text-muted-foreground"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("font-mono text-micro font-medium", micOpen && "font-semibold text-live-text")}>
            {micOpen ? "Going out live" : "Mic check \u00b7 only you see this"}
          </span>
          <span className="min-w-0 truncate text-xs text-text-faint" title={device}>{device}</span>
        </span>
        <MicMeter stream={micStream} open={micOpen} />
      </section>
    </div>
  )
}
