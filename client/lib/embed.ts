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

/**
 * Extra controls the owner ticked in the Embed dialog. Each rides on the
 * iframe's address (`?volume=1&mute=1`) and the embed page reads it back;
 * none set is the original player, so snippets pasted before these existed
 * render exactly as they did.
 */
export interface EmbedOptions {
  /** A volume slider. Not drawn on iPhone and iPad, which ignore it. */
  volume?: boolean
  /** A mute / unmute button. */
  mute?: boolean
}

export function embedUrl(slug: string, options: EmbedOptions = {}): string {
  const query = new URLSearchParams()
  if (options.volume) query.set("volume", "1")
  if (options.mute) query.set("mute", "1")
  const qs = query.toString()
  return `${env.appUrl}/embed/${slug}${qs ? `?${qs}` : ""}`
}

/** The options back out of the embed page's query (`"1"` is on). */
export function parseEmbedOptions(params: Record<string, string | string[] | undefined>): EmbedOptions {
  const on = (key: string) => params[key] === "1"
  return { volume: on("volume"), mute: on("mute") }
}

/**
 * The iframe a Pro owner pastes into their own site.
 *
 * `allow="autoplay"` lets the play button work on the first tap in browsers
 * that otherwise gate media in cross-origin frames; the player still never
 * starts without a click. `loading="lazy"` keeps a footer embed from
 * fetching the player bundle for a visitor who never scrolls to it.
 */
export function embedSnippet(slug: string, stationName: string, options: EmbedOptions = {}): string {
  const title = stationName.replace(/"/g, "&quot;")
  return [
    `<iframe`,
    `  src="${embedUrl(slug, options)}"`,
    `  title="${title} on GoCast"`,
    `  width="100%"`,
    `  height="${EMBED_HEIGHT}"`,
    `  style="border:0;border-radius:12px;overflow:hidden"`,
    `  allow="autoplay"`,
    `  loading="lazy"`,
    `></iframe>`,
  ].join("\n")
}
