/*
 * Plain module, deliberately: this is imported by HeroSection, which is a
 * server component, AND by HeroStationPlayer, which is a client one.
 *
 * It used to live in HeroStationPlayer. That file carries "use client", so
 * every one of its exports becomes a client REFERENCE — importing the function
 * into a server component and calling it does not call it, it throws, and the
 * whole homepage 500s. A shared helper used on both sides of the boundary has
 * to sit in a module that claims neither.
 */
/**
 * Continuous uptime, from the station's `started_at`.
 *
 * This is the best number the page has. The claim underneath the whole product
 * is that a station runs itself once you set it up, and a counter that only
 * goes up is that claim stated as evidence — it costs nothing to keep true and
 * gets more persuasive every day nobody touches it. Listener count was the
 * obvious alternative and is the wrong one before launch: it is a number that
 * can embarrass you, on the most-read part of the site.
 *
 * Coarse on purpose. Minute-accurate uptime invites the reader to check it
 * against the clock; "6 days" is the part that carries meaning, and it lets
 * the value survive a slow revalidate without ever being visibly wrong.
 */
export function formatUptime(startedAt: string | null | undefined, now: number = Date.now()): string | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null

  const seconds = Math.floor((now - started) / 1000)
  // Clock skew between the server and the visitor can put this slightly in the
  // future. "On air -1m" is worse than showing nothing for a few seconds.
  if (seconds < 60) return null

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m on air`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h on air`
  const days = Math.floor(hours / 24)
  return `${days}d on air`
}
