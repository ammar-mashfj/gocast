import type { Metadata } from "next"
import { LibraryView } from "./LibraryView"
import { loadLibrary } from "./load"

// Its own tab title: every dashboard tab used to read the marketing title,
// so history and open tabs were indistinguishable.
export const metadata: Metadata = { title: "Library" }

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Heading, switch and the count/runtime/storage line all live inside
  // LibraryView: the line changes on every upload, delete and tag edit, so
  // it renders from the same client state as the list itself.
  return <LibraryView page="library" {...await loadLibrary(slug)} />
}
