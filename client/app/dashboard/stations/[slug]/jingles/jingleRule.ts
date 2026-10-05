import type { JingleList, JingleRule } from "@/interfaces/JingleList"

/**
 * A jingle list's rule as one sentence, the way the Jingles page shows it:
 *
 *   "A random jingle every 4 songs, 07:00–10:00 on weekdays."
 *
 * Pure, so the page, the rule dialog's preview and the tests all say the
 * same thing.
 */

/** API days are 0 = Sunday; this is the order people read a week in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function list(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

export function pickPhrase(rule: Pick<JingleRule, "pick" | "pinned_track_id">, pinnedTitle?: string): string {
  if (rule.pick === "in_order") return "The next jingle in order"
  if (rule.pick === "single") return pinnedTitle ? `“${pinnedTitle}”` : "The same jingle"
  return "A random jingle"
}

export function frequencyPhrase(rule: Pick<JingleRule, "frequency" | "every_minutes" | "every_songs" | "times" | "exact">): string {
  if (rule.frequency === "minutes") {
    const n = rule.every_minutes ?? 0
    if (n === 1) return "every minute"
    if (n === 60) return "every hour"
    if (n > 60 && n % 60 === 0) return `every ${n / 60} hours`
    return `every ${n} minutes`
  }
  if (rule.frequency === "songs") {
    const n = rule.every_songs ?? 0
    return n === 1 ? "after every song" : `every ${n} songs`
  }
  const times = rule.times ?? []
  if (times.length === 0) return "at no set time yet"
  if (times.length === 24 && times.every((t) => t.endsWith(":00"))) {
    return rule.exact ? "at the top of every hour, on the dot" : "around the top of every hour"
  }
  const named = times.length > 4 ? `${times.length} set times a day` : list(times)
  if (times.length > 4) return rule.exact ? `at ${named}, on the dot` : `around ${named}`
  return rule.exact ? `at ${named} on the dot` : `around ${named}`
}

/** "on weekdays", "on Mon, Wed and Fri", or "" for every day. */
export function daysPhrase(days: number[] | null): string {
  if (days === null || days.length === 0 || days.length === 7) return ""
  const set = [...new Set(days)].sort()
  if (set.join() === "1,2,3,4,5") return "on weekdays"
  if (set.join() === "0,6") return "at weekends"
  const ordered = WEEK_ORDER.filter((d) => set.includes(d)).map((d) => SHORT_DAYS[d])
  return `on ${list(ordered)}`
}

export function whenPhrase(rule: Pick<JingleRule, "days" | "from_time" | "to_time">): string {
  const days = daysPhrase(rule.days)
  const hours = rule.from_time && rule.to_time ? `${rule.from_time}–${rule.to_time}` : ""
  return [hours, days].filter(Boolean).join(" ")
}

export function ruleSentence(rule: JingleRule, pinnedTitle?: string): string {
  const when = whenPhrase(rule)
  return `${pickPhrase(rule, pinnedTitle)} ${frequencyPhrase(rule)}${when ? `, ${when}` : ""}.`
}

/** Fields a list holds that the rule dialog edits. */
export function ruleOf(list: JingleList): JingleRule {
  return {
    pick: list.pick,
    pinned_track_id: list.pinned_track_id,
    frequency: list.frequency,
    every_minutes: list.every_minutes,
    every_songs: list.every_songs,
    times: list.times,
    exact: list.exact,
    days: list.days,
    from_time: list.from_time,
    to_time: list.to_time,
  }
}

/** Does the rule read the station clock (and so need a timezone)? */
export function usesClock(rule: Pick<JingleRule, "frequency" | "days" | "from_time">): boolean {
  return rule.frequency === "times" || rule.days !== null || rule.from_time !== null
}

/** Every hour on the hour: the "top of the hour" shortcut. */
export const HOURLY = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)
