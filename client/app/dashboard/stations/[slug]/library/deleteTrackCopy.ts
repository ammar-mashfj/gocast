/**
 * The confirm text for deleting one file. It names how many playlists lose
 * the track, because the delete is offered from inside a playlist too, and
 * someone looking at one playlist can't see the others it is in.
 */
export function deleteTrackDescription(playlistCount: number): string {
  if (playlistCount <= 0) return "It isn't in any playlist. This can't be undone."
  if (playlistCount === 1) return "It's in 1 playlist and will be taken out of it. This can't be undone."
  return `It's in ${playlistCount} playlists and will be taken out of all of them. This can't be undone.`
}
