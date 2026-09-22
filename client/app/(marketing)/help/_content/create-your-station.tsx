import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        A station is the thing listeners tune into: a name, a look, and an
        address of its own. On the free plan you get one; on Pro you can run up
        to five.
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
          Worth a moment&#39;s thought: people will bookmark it, and changing it
          later breaks every link already out there.
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
        alt="A station header showing its artwork, the name Night Shift Radio, a genre tag and a one-line description."
        width={2042}
        height={360}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>Creating It Does Not Start It</h2>
      <p>
        A new station is off air. That is not a step somebody forgot &mdash; a
        station only holds a broadcast server while it is switched on, which is
        why an off-air station has no stream, no listener count and nothing
        playing. Pressing the power button, or simply going live, starts it. See{" "}
        <Link href="/help/turning-your-station-on-and-off">
          turning your station on and off
        </Link>
        .
      </p>

      <h2>The Checklist</h2>
      <p>
        Your station page shows a short list of things still worth doing
        &mdash; artwork, a description, your first broadcast. It disappears for
        good once they are all done, rather than sitting there as a row of
        ticks. If an item is missing from your list, it is because it does not
        apply to your plan.
      </p>
    </>
  )
}
