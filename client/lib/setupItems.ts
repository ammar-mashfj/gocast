import type { Station } from "@/interfaces/Station"

export interface SetupItem {
  key: string
  done: boolean
  title: string
  hint: string
  /** Goes to a page. */
  href?: string
  /** Opens the station edit dialog instead. */
  edits?: true
}

/**
 * What a station still needs, in the order the work runs: make it look
 * right, give it something to play, make it findable, then the payoff. "Get
 * your first listener" stays last: it is the one item the owner can't simply
 * go and do. Shared by the top-bar setup chip and the overview checklist so
 * the two never disagree.
 */
export function setupItems(station: Station, trackCount: number, hasListeners: boolean, autoDjLocked: boolean): SetupItem[] {
  const base = `/dashboard/stations/${station.slug}`
  return [
    { key: "artwork", done: !!station.artwork_url, title: "Add station artwork", hint: "Shows on your player page and wherever your link is shared.", edits: true },
    { key: "description", done: !!station.description, title: "Write a description", hint: "Two lines telling listeners what you play.", edits: true },
    ...(autoDjLocked
      ? []
      : [{ key: "tracks", done: trackCount > 0, title: "Fill AutoDJ’s playlist", hint: "It plays whenever you’re not live. Empty, the station plays silence.", href: `${base}/library` }]),
    { key: "links", done: (station.social_links?.length ?? 0) > 0, title: "Add your social links", hint: "So listeners can follow you between shows.", href: `${base}/settings#links` },
    { key: "listener", done: hasListeners, title: "Get your first listener", hint: "Share your link. Nobody has tuned in yet." },
  ]
}

/** Whether anyone has ever listened, from the station's own stats. */
export function stationHasListeners(station: Station): boolean {
  return station.stats?.has_listeners ?? (station.stats?.peak_listeners ?? 0) > 0
}
