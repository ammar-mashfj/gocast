import type { Metadata } from "next"
import { LibraryView } from "../library/LibraryView"
import { loadLibrary } from "../library/load"

export const metadata: Metadata = { title: "Playlists" }

export default async function PlaylistsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  /** `?playlist=<id>` opens that playlist (the status band's Open playlist). */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const { playlist } = await searchParams
  return <LibraryView page="playlists" openPlaylistId={typeof playlist === "string" ? playlist : undefined} {...await loadLibrary(slug)} />
}
