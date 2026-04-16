/**
 * Share a URL using the native share sheet if available, otherwise copy to clipboard.
 * Returns 'shared' | 'copied' so callers can show appropriate feedback.
 */
export async function shareOrCopy(url: string, title?: string): Promise<'shared' | 'copied'> {
  if (navigator.share) {
    try {
      await navigator.share({ url, title })
      return 'shared'
    } catch (e) {
      // User cancelled the share sheet — fall through to copy
      if (e instanceof DOMException && e.name === 'AbortError') {
        return 'copied'
      }
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
