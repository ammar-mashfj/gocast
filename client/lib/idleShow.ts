import api from "@/lib/axios"
import type { Plan } from "@/interfaces/Plan"

/**
 * The idle check on Free live shows (IdleShowGuard).
 *
 * Free has no AutoDJ, so a studio left running is the only way a Free station
 * stays on air around the clock: a laptop or a phone on a charger playing the
 * queue all night. The rule is that a Free show needs someone at the desk.
 * After IDLE_MS with nobody touching the dashboard the host is asked whether
 * they are still there, and WARN_MS later, unanswered, the show ends.
 *
 * Pro (AutoDJ) is never checked: there the station keeps playing on its own
 * whether the studio is watched or not.
 */

/** No activity for this long and the host is asked. The default; the API's config sets it. */
export const IDLE_MS = 60 * 60 * 1000

/** How long the question waits before the show ends. */
export const WARN_MS = 10 * 60 * 1000

/**
 * The timings for this account, from its plan (`plan.idle_check`, set in the
 * API's config/studio.php), or null when its shows aren't checked.
 *
 * An API older than the check sends no `idle_check` at all; a plan without
 * AutoDJ then gets the defaults, so the rule holds through a deploy where the
 * frontend lands first.
 */
export function idleTimings(plan: Plan | null): { idleMs: number; warnMs: number } | null {
  if (!plan) return null
  if (plan.idle_check === undefined) return plan.autodj_enabled ? null : { idleMs: IDLE_MS, warnMs: WARN_MS }
  if (!plan.idle_check) return null
  return { idleMs: plan.idle_check.idle_seconds * 1000, warnMs: plan.idle_check.warn_seconds * 1000 }
}

/**
 * "an hour", "10 minutes", "30 seconds": a timing as the dialog and the
 * wrap screen say it.
 */
export function describeDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds % 3600 === 0) {
    const h = seconds / 3600
    return h === 1 ? "an hour" : `${h} hours`
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60
    return m === 1 ? "a minute" : `${m} minutes`
  }
  return seconds === 1 ? "a second" : `${seconds} seconds`
}

/**
 * Left in this tab when the idle check ended a show, read once by the wrap
 * screen to say why and to offer AutoDJ. Beside signOffKey, same lifetime.
 */
export const idleEndedKey = (slug: string) => `gocast:idle-ended:${slug}`

/**
 * What came of a question: the host stayed ("kept", also Get AutoDJ), ended
 * the show from it ("ended_by_host"), or never answered ("ended").
 */
export type IdleCheckOutcome = "kept" | "ended" | "ended_by_host"

/**
 * Tell the API what the check did (POST /stations/{slug}/idle-checks), for
 * the admin station timeline: how often hosts are asked, how often they answer,
 * how often a show is ended. Best effort; a lost report changes nothing.
 */
export function reportIdleCheck(slug: string, outcome: IdleCheckOutcome, details: { onAirSeconds: number | null; hidden: boolean }) {
  void api
    .post(`/stations/${slug}/idle-checks`, {
      outcome,
      on_air_seconds: details.onAirSeconds,
      hidden: details.hidden,
    })
    .catch(() => {})
}

/** "9:05" — the countdown, as the dialog and the tab title read it. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}
