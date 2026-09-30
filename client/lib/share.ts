import { toast } from "sonner"

/**
 * Share a URL using the native share sheet if available, otherwise copy to clipboard.
 * Returns 'shared' | 'copied' | 'failed' so callers can show appropriate feedback.
 *
 * Always toasts on copy success/failure; native share is silent (the share sheet
 * is its own feedback). Callers may add their own contextual UI on top.
 *
 * `text` is the sentence that travels with the link — what a per-network share
 * button would have pre-filled into the composer. Without it every target gets
 * a bare URL and has to speak for itself, which is a real downgrade from an
 * intent link; `title` does not cover this, as most targets either ignore it
 * or use it only to name the thing rather than to say anything about it.
 */
export async function shareOrCopy(
  url: string,
  title?: string,
  text?: string,
): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      // Built conditionally rather than passed with undefined values: some
      // targets treat a present-but-empty field as an empty message.
      await navigator.share({ url, ...(title ? { title } : {}), ...(text ? { text } : {}) })
      return "shared"
    } catch (e) {
      // User cancelled the share sheet — silently fall through to copy
      if (!(e instanceof DOMException) || e.name !== "AbortError") {
        // Real share error (not just a dismissal) — fall through to copy
      }
    }
  }

  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    toast.error("Clipboard not available — copy this link manually", {
      description: url,
      duration: 8000,
    })
    return "failed"
  }

  try {
    await navigator.clipboard.writeText(url)
    toast.success("Link copied")
    return "copied"
  } catch {
    toast.error("Couldn't copy — copy this link manually", {
      description: url,
      duration: 8000,
    })
    return "failed"
  }
}

/**
 * Where a shared link was minted, for the `utm_source` on it.
 *
 * Without a tag, a link posted to WhatsApp, Telegram or a Facebook group
 * arrives with no referrer and lands in analytics as "other" — two thirds of
 * traffic, at the last count. The medium is always "share"; the source says
 * whose hand the link left.
 */
export type ShareSource = "owner" | "listener" | "qr" | "embed"

/**
 * The public player URL with attribution on it. The bare URL is still what
 * is displayed and what search engines index (the page sets its own
 * canonical), so the tag never shows up anywhere a person has to read it.
 */
export function taggedStationUrl(appUrl: string, slug: string, source: ShareSource): string {
  return `${appUrl}/station/${slug}?utm_source=${source}&utm_medium=share`
}
