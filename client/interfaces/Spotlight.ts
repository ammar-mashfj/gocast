/**
 * A dialog the dashboard opens on load: an offer, a new feature, a notice.
 * Written in /admin/spotlights; who gets which is decided by the API on every
 * read (SpotlightController), so this is only ever the caller's own list.
 */
export interface Spotlight {
  key: string
  kind: "offer" | "feature" | "notice"
  title: string
  /** The minimised chip's text: a short label, or the title when none was set. */
  chip_label: string
  /** Rendered from the admin's Markdown with raw HTML stripped. */
  body_html: string | null
  image_url: string | null
  cta_label: string | null
  /** A dashboard path, or a full https:// address. */
  cta_url: string | null
  ends_at: string | null
  /** `new` opens as a dialog; `minimized` waits as a chip in the top bar. */
  state: "new" | "minimized"
  /** Seen only because this account is on the test list. */
  preview: boolean
}

export type SpotlightAction = "seen" | "minimize" | "click"
