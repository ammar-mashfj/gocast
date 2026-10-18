import type { ComponentType } from "react"
import type { IconProps } from "@tabler/icons-react"
import {
  IconBrandApplePodcast,
  IconBrandBandcamp,
  IconBrandBluesky,
  IconBrandCashapp,
  IconBrandDeezer,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandKick,
  IconBrandLinkedin,
  IconBrandLinktree,
  IconBrandMastodon,
  IconBrandMedium,
  IconBrandPatreon,
  IconBrandPaypal,
  IconBrandPinterest,
  IconBrandReddit,
  IconBrandSnapchat,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTidal,
  IconBrandTiktok,
  IconBrandTwitch,
  IconBrandVk,
  IconBrandWhatsapp,
  IconBrandX,
  IconBrandYoutube,
  IconWorld,
} from "@tabler/icons-react"
import type { SocialLink } from "@/interfaces/Station"

/**
 * Turning a station's links into icons.
 *
 * The owner never picks a platform — they paste a URL and the glyph is read
 * off its hostname. A dropdown would have capped the feature at whatever list
 * we thought of, which is the one thing a "links" field must not do: a station
 * with a Mixcloud page and a Ko-fi is not an edge case, and neither has a
 * Tabler glyph. They get the globe, which is why the globe branch renders the
 * name as text — a bare unlabelled world icon tells a listener nothing.
 *
 * Remote favicons were the other option and are worse: the public player page
 * would hand every listener's IP to a third party per link, per page load, for
 * a 16px image that looks like mud next to line art.
 */

type IconComponent = ComponentType<IconProps>

interface Platform {
  icon: IconComponent
  name: string
}

/**
 * Keyed by hostname, `www.` already stripped. Subdomains resolve by walking
 * labels off the front (artist.bandcamp.com -> bandcamp.com), so a full host
 * is only listed when it needs to beat its own parent — podcasts.apple.com
 * would otherwise have to share an entry with the rest of apple.com.
 */
const PLATFORMS: Record<string, Platform> = {
  "instagram.com": { icon: IconBrandInstagram, name: "Instagram" },
  "facebook.com": { icon: IconBrandFacebook, name: "Facebook" },
  "fb.com": { icon: IconBrandFacebook, name: "Facebook" },
  "x.com": { icon: IconBrandX, name: "X" },
  "twitter.com": { icon: IconBrandX, name: "X" },
  "youtube.com": { icon: IconBrandYoutube, name: "YouTube" },
  "youtu.be": { icon: IconBrandYoutube, name: "YouTube" },
  "tiktok.com": { icon: IconBrandTiktok, name: "TikTok" },
  "soundcloud.com": { icon: IconBrandSoundcloud, name: "SoundCloud" },
  "bandcamp.com": { icon: IconBrandBandcamp, name: "Bandcamp" },
  "spotify.com": { icon: IconBrandSpotify, name: "Spotify" },
  "podcasts.apple.com": { icon: IconBrandApplePodcast, name: "Apple Podcasts" },
  "deezer.com": { icon: IconBrandDeezer, name: "Deezer" },
  "tidal.com": { icon: IconBrandTidal, name: "Tidal" },
  "twitch.tv": { icon: IconBrandTwitch, name: "Twitch" },
  "kick.com": { icon: IconBrandKick, name: "Kick" },
  "discord.gg": { icon: IconBrandDiscord, name: "Discord" },
  "discord.com": { icon: IconBrandDiscord, name: "Discord" },
  "t.me": { icon: IconBrandTelegram, name: "Telegram" },
  "telegram.me": { icon: IconBrandTelegram, name: "Telegram" },
  "wa.me": { icon: IconBrandWhatsapp, name: "WhatsApp" },
  "whatsapp.com": { icon: IconBrandWhatsapp, name: "WhatsApp" },
  "threads.net": { icon: IconBrandThreads, name: "Threads" },
  "threads.com": { icon: IconBrandThreads, name: "Threads" },
  "bsky.app": { icon: IconBrandBluesky, name: "Bluesky" },
  // Mastodon is thousands of hosts; only the flagship can be matched by name.
  // Every other instance takes the globe, correctly — we cannot tell one from
  // a personal blog without asking the server.
  "mastodon.social": { icon: IconBrandMastodon, name: "Mastodon" },
  "reddit.com": { icon: IconBrandReddit, name: "Reddit" },
  "linktr.ee": { icon: IconBrandLinktree, name: "Linktree" },
  "patreon.com": { icon: IconBrandPatreon, name: "Patreon" },
  "paypal.com": { icon: IconBrandPaypal, name: "PayPal" },
  "paypal.me": { icon: IconBrandPaypal, name: "PayPal" },
  "cash.app": { icon: IconBrandCashapp, name: "Cash App" },
  "linkedin.com": { icon: IconBrandLinkedin, name: "LinkedIn" },
  "pinterest.com": { icon: IconBrandPinterest, name: "Pinterest" },
  "snapchat.com": { icon: IconBrandSnapchat, name: "Snapchat" },
  "vk.com": { icon: IconBrandVk, name: "VK" },
  "github.com": { icon: IconBrandGithub, name: "GitHub" },
  "medium.com": { icon: IconBrandMedium, name: "Medium" },
}

/** Mirrors `social_links` max:8 in UpdateStationRequest. */
export const MAX_SOCIAL_LINKS = 8

export interface ResolvedSocialLink {
  href: string
  icon: IconComponent
  /** Owner's label, else the platform name, else the bare hostname. */
  name: string
  /** False when this fell through to the globe — the caller shows text for it. */
  known: boolean
}

function findPlatform(hostname: string): Platform | undefined {
  const parts = hostname.split(".")

  // Longest first, stopping at two labels: podcasts.apple.com before
  // apple.com, and never as far down as a bare "com".
  for (let i = 0; i + 2 <= parts.length; i++) {
    const platform = PLATFORMS[parts.slice(i).join(".")]

    if (platform) {
      return platform
    }
  }

  return undefined
}

/**
 * Null for anything that cannot be rendered as a link. The server validates on
 * the way in, but these rows are years of stored JSON on a page that must not
 * blank out because one of them is malformed — a bad row is skipped, not thrown.
 */
export function resolveSocialLink(link: SocialLink): ResolvedSocialLink | null {
  let parsed: URL

  try {
    parsed = new URL(link.url)
  } catch {
    return null
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null
  }

  // Chromium's parser takes "https://not a url" and percent-encodes the
  // spaces into the host; the API's url rule refuses it. A host is labels of
  // letters, digits, hyphens (and underscores, which the API allows).
  if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i.test(parsed.hostname)) {
    return null
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "")
  const platform = findPlatform(hostname)
  const label = link.label?.trim()

  return {
    href: parsed.toString(),
    icon: platform?.icon ?? IconWorld,
    name: label || platform?.name || hostname,
    known: platform !== undefined,
  }
}

/**
 * Nobody types a scheme. Without this every pasted "instagram.com/x" comes
 * back a 422 for a reason the owner did nothing wrong about. An explicit
 * scheme of any kind is left alone so the server still gets to reject it.
 */
export function normalizeSocialUrl(input: string): string {
  const trimmed = input.trim()

  if (trimmed === "" || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

/**
 * The platforms the links editor offers by name: pick one, type the handle.
 * Anything else goes in as an "Other link" (full address, optional name) and
 * still gets its icon from PLATFORMS above, so a Patreon or PayPal added that
 * way shows its glyph. Mixcloud is missing only because Tabler has no glyph.
 *
 * `base` is the fixed part of the address, shown before the field; the handle
 * is whatever follows it. `at`: "add" puts the @ that the address needs
 * (tiktok.com/@name), "strip" drops one typed out of habit (instagram.com/name).
 */
export interface PickerPlatform {
  key: string
  name: string
  icon: IconComponent
  base: string
  placeholder: string
  at?: "add" | "strip"
}

export const PICKER_PLATFORMS: PickerPlatform[] = [
  { key: "instagram", name: "Instagram", icon: IconBrandInstagram, base: "https://instagram.com/", placeholder: "yourstation", at: "strip" },
  { key: "facebook", name: "Facebook", icon: IconBrandFacebook, base: "https://facebook.com/", placeholder: "yourstation" },
  { key: "youtube", name: "YouTube", icon: IconBrandYoutube, base: "https://youtube.com/", placeholder: "@yourstation", at: "add" },
  { key: "tiktok", name: "TikTok", icon: IconBrandTiktok, base: "https://tiktok.com/", placeholder: "@yourstation", at: "add" },
  { key: "x", name: "X", icon: IconBrandX, base: "https://x.com/", placeholder: "yourstation", at: "strip" },
  { key: "threads", name: "Threads", icon: IconBrandThreads, base: "https://threads.com/", placeholder: "@yourstation", at: "add" },
  { key: "whatsapp", name: "WhatsApp", icon: IconBrandWhatsapp, base: "https://wa.me/", placeholder: "15551234567" },
  { key: "telegram", name: "Telegram", icon: IconBrandTelegram, base: "https://t.me/", placeholder: "yourstation", at: "strip" },
  { key: "discord", name: "Discord", icon: IconBrandDiscord, base: "https://discord.gg/", placeholder: "invitecode" },
  { key: "spotify", name: "Spotify", icon: IconBrandSpotify, base: "https://open.spotify.com/", placeholder: "show/…" },
  { key: "soundcloud", name: "SoundCloud", icon: IconBrandSoundcloud, base: "https://soundcloud.com/", placeholder: "yourstation" },
  { key: "twitch", name: "Twitch", icon: IconBrandTwitch, base: "https://twitch.tv/", placeholder: "yourstation", at: "strip" },
  { key: "bluesky", name: "Bluesky", icon: IconBrandBluesky, base: "https://bsky.app/profile/", placeholder: "yourstation.bsky.social" },
]

/** "instagram.com/x" from any of "https://www.instagram.com/x", "http://instagram.com/x"… */
function bare(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "")
}

/**
 * Which picker platform a saved address belongs to, and its handle. Null when
 * it doesn't start with a platform's base (another host, or youtu.be, or
 * m.facebook.com): those load as Other links, unchanged.
 */
export function matchPickerPlatform(url: string): { platform: PickerPlatform; handle: string } | null {
  const b = bare(url)
  for (const platform of PICKER_PLATFORMS) {
    const prefix = bare(platform.base)
    if (b.toLowerCase().startsWith(prefix.toLowerCase()) && b.length > prefix.length) {
      return { platform, handle: b.slice(prefix.length) }
    }
  }
  return null
}

/** What was typed or pasted into a platform's field, as the handle alone. */
export function cleanHandle(platform: PickerPlatform, input: string): string {
  let handle = input.trim()
  const prefix = bare(platform.base)
  const pasted = bare(handle)
  // A whole address pasted in: keep what follows the base.
  if (pasted.toLowerCase().startsWith(prefix.toLowerCase())) handle = pasted.slice(prefix.length)
  handle = handle.replace(/^\/+/, "")
  if (platform.at === "strip") handle = handle.replace(/^@/, "")
  if (platform.at === "add" && handle !== "" && !handle.startsWith("@") && !handle.includes("/")) handle = `@${handle}`
  return handle
}
