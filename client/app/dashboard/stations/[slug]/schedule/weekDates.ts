import { WEEK_ORDER } from "./WeekGrid"

/**
 * The day-of-month for each of this week's days, Monday first, on the
 * station's calendar (or the browser's without a zone). A station in Tokyo
 * can already be on tomorrow when its owner in Lisbon opens the page.
 */
export function weekDates(timeZone: string | null): Date[] {
  let today: Date
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone ?? undefined,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date())
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "", 10)
    today = new Date(get("year"), get("month") - 1, get("day"))
  } catch {
    today = new Date()
  }
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return WEEK_ORDER.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}
