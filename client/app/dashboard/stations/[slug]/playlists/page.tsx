import type { Metadata } from "next"
import { LibraryView } from "../library/LibraryView"
import { loadLibrary } from "../library/load"

export const metadata: Metadata = { title: "Playlists" }

export default async function PlaylistsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <LibraryView page="playlists" {...await loadLibrary(slug)} />
}
