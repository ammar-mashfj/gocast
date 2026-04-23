import { toast } from "sonner"

/**
 * Share a URL using the native share sheet if available, otherwise copy to clipboard.
 * Returns 'shared' | 'copied' | 'failed' so callers can show appropriate feedback.
 *
 * Always toasts on copy success/failure; native share is silent (the share sheet
 * is its own feedback). Callers may add their own contextual UI on top.
 */
export async function shareOrCopy(
  url: string,
  title?: string,
): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ url, title })
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
