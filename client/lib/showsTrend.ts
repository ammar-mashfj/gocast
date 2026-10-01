/**
 * One sentence comparing your recent shows with the ones before: are they
 * running longer or shorter, and drawing more or fewer people at their peak.
 *
 * It only says what the numbers can carry. The latest shows (up to five) are
 * compared with the same number just before them, and nothing is said with
 * fewer than three on each side, or when the change is small (under 15%), so
 * one long show doesn't become "your shows are getting longer". Whether people
 * stay to the end isn't something we measure, so it isn't said.
 */

export interface TrendShow {
  /** Seconds on air. */
  seconds: number
  peak: number
}

const WINDOW = 5
const MIN_SIDE = 3
const THRESHOLD = 0.15

type Direction = "up" | "down" | null

function direction(recent: number, earlier: number): Direction {
  if (earlier <= 0) return recent > 0 ? "up" : null
  const change = (recent - earlier) / earlier
  if (change >= THRESHOLD) return "up"
  if (change <= -THRESHOLD) return "down"
  return null
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** `shows` newest first. Null when there's nothing honest to say. */
export function showsTrend(shows: TrendShow[]): string | null {
  const side = Math.min(WINDOW, Math.floor(shows.length / 2))
  if (side < MIN_SIDE) return null

  const recent = shows.slice(0, side)
  const earlier = shows.slice(side, side * 2)

  const length = direction(mean(recent.map((s) => s.seconds)), mean(earlier.map((s) => s.seconds)))
  // A peak that moves from 1 to 2 is +100% and means nothing: a whole extra
  // listener on average is the least that counts.
  const recentPeak = mean(recent.map((s) => s.peak))
  const earlierPeak = mean(earlier.map((s) => s.peak))
  const peak = Math.abs(recentPeak - earlierPeak) >= 1 ? direction(recentPeak, earlierPeak) : null

  const runs = length === "up" ? "longer" : "shorter"
  const draws = peak === "up" ? "more" : "fewer"

  if (length && peak) {
    const joint = (length === "up") === (peak === "up") ? "and" : "but"
    return `Your recent shows run ${runs} ${joint} draw ${draws} listeners at their peak.`
  }
  if (length) return `Your recent shows run ${runs} than the ones before.`
  if (peak) return `Your recent shows draw ${draws} listeners at their peak than the ones before.`
  return null
}
