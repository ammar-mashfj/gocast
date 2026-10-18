import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        A playlist is a named set of tracks from your library. Your station can
        have as many as you like, and they are what the{" "}
        <Link href="/help/schedule-playlists-by-time">schedule</Link>{" "}points at.
      </p>

      <ZoomableImage
        src="/help/music-library.webp"
        alt="The Playlists page: Main rotation, Morning Soul, Lofi Afternoon, Night Ambient and Weekend Mix down the left, each with its track count and running time; on the right the open playlist, Main rotation, which plays when nothing is scheduled."
        width={2552}
        height={1628}
       
      />

      <h2>The Rules Worth Knowing</h2>
      <ul>
        <li>
          <strong>A track can be in as many playlists as you like.</strong>{" "}It
          is stored once and counted against your 3 GB once. Putting the same
          song in Breakfast and in Weekend Brunch costs you nothing.
        </li>
        <li>
          <strong>Each playlist remembers its own place.</strong>{" "}Leave one
          part-way through and it carries on from there next time its turn
          comes round, rather than restarting from the top and playing you the
          same four songs forever.
        </li>
        <li>
          <strong>Shuffle is per playlist.</strong>{" "}Turn it on and that playlist
          deals itself a fresh random order each time it runs out &mdash; every
          track airs once before any track airs twice, so it is a proper shuffle
          rather than a dice roll that can play the same song twice in ten
          minutes. Sequential playlists play exactly as you dragged them.
        </li>
        <li>
          <strong>One playlist is the default.</strong>{" "}It plays whenever
          nothing is scheduled, it is where uploads land unless you say
          otherwise, and it cannot be deleted. Its tag reads{" "}
          <strong>Plays when nothing’s scheduled</strong>. To hand the job to
          another playlist, open it and press <strong>Make default</strong>.
        </li>
      </ul>

      <h2>The Default Playlist Is the Safety Net</h2>
      <p>
        This is the part to internalise. Whatever your schedule looks like,
        every gap in it falls through to the default playlist, so there is never
        a moment where your station has nothing to do. If you never build a
        schedule at all, the default playlist simply plays around the clock,
        which is a perfectly good station.
      </p>

      <h2>They Do Not Have to Be Music</h2>
      <p>
        A playlist holds audio files. Recorded news bulletins, podcast episodes,
        a syndicated show, an audiobook &mdash; all of it works the same way.
        Put it in its own playlist and give that playlist a slot.
      </p>
      <p>
        The <strong>Right now</strong>{" "}card at the top of the{" "}
        <strong>Schedule</strong>{" "}page says which playlist AutoDJ has lined up
        at this moment, until when, and what takes over after it.
      </p>
    </>
  )
}
