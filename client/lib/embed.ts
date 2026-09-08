import { env } from "@/lib/env"

/**
 * Height the snippet asks the host page for, in CSS pixels.
 *
 * The embed is one row — artwork, title, play — and lays itself out to
 * whatever height it is given, so this is a recommendation the host can
 * change, not a contract. It is exported so the dashboard preview can render
 * at exactly the size the pasted snippet will.
 */
export const EMBED_HEIGHT = 88

export function embedUrl(slug: string): string {
  return `${env.appUrl}/embed/${slug}`
}

/**
 * The iframe a Pro owner pastes into their own site.
 *
 * `allow="autoplay"` lets the play button work on the first tap in browsers
 * that otherwise gate media in cross-origin frames; the player still never
 * starts without a click. `loading="lazy"` keeps a footer embed from
 * fetching the player bundle for a visitor who never scrolls to it.
 */
export function embedSnippet(slug: string, stationName: string): string {
  const title = stationName.replace(/"/g, "&quot;")
  return [
    `<iframe`,
    `  src="${embedUrl(slug)}"`,
    `  title="${title} on GoCast"`,
    `  width="100%"`,
    `  height="${EMBED_HEIGHT}"`,
    `  style="border:0;border-radius:12px;overflow:hidden"`,
    `  allow="autoplay"`,
    `  loading="lazy"`,
    `></iframe>`,
  ].join("\n")
}
