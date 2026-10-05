import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        A station is the thing listeners tune into: a name, a look, and an
        address of its own. Every account has one, on Free and on Pro.
      </p>

      <h2>What You Are Asked For</h2>
      <ul>
        <li>
          <strong>A name.</strong>{" "}This is what shows in the player, in the
          browser tab, and in the preview when somebody pastes your link into a
          chat. It can be changed later.
        </li>
        <li>
          <strong>An address.</strong>{" "}Built from the name &mdash; &ldquo;Night
          Shift Radio&rdquo; becomes <code>/station/night-shift-radio</code>.
          It never changes, even if you rename the station later, so every
          link you’ve shared keeps working.
        </li>
        <li>
          <strong>Artwork and a description.</strong>{" "}Both optional at creation
          and both worth doing before you share anything, because they are what
          a stranger sees first. Two lines saying what you play does more work
          than any other text on the page.
        </li>
      </ul>

      <ZoomableImage
        src="/help/station-header.webp"
        alt="A station's header on its Overview: artwork, the name Night Shift Radio, a genre tag, a one-line description, and when it started and was last live."
        width={1996}
        height={280}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>Creating It Does Not Start It</h2>
      <p>
        A new station is off air. That is not a step somebody forgot &mdash; a
        station only holds a broadcast server while it is switched on, which is
        why an off-air station has no stream, no listener count and nothing
        playing. Starting AutoDJ (Pro), or simply going live, starts it. See{" "}
        <Link href="/help/turning-your-station-on-and-off">
          turning your station on and off
        </Link>
        .
      </p>

      <h2>The Checklist</h2>
      <p>
        Your station’s Overview shows what is still worth doing &mdash; artwork,
        a description, music for AutoDJ, your show times, your links, your
        first listener &mdash; each one a tile that takes you straight to it.
        The list disappears once everything is done, rather than sitting there
        as a row of ticks, and <strong>Hide for now</strong>{" "}tucks it away in
        that browser. Music for AutoDJ only appears on Pro.
      </p>
    </>
  )
}
