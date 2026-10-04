/**
 * Copy text, falling back to the old selection copy where the Clipboard API
 * is missing or refused — a page served over plain http (testing on a LAN)
 * has no navigator.clipboard at all. Call it from the click itself: the
 * fallback needs the user's gesture. Resolves false when nothing worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyBySelection(text)
  }
}

function copyBySelection(text: string): boolean {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    area.remove()
  }
}
