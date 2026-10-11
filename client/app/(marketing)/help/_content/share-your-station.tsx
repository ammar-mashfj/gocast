import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        One link does everything:{" "}
        <code>gocast.fm/station/your-station</code>. It works on any phone or
        computer, needs no account and no app, and it is the same link whether
        you are on air or not.
      </p>

      <h2>From the Dashboard</h2>
      <p>
        The <strong>Your link</strong>{" "}card on your station’s Overview has the
        link with Copy, <strong>Share…</strong>{" "}for WhatsApp, email and X, and{" "}
        <strong>Tune-in code</strong>: a QR code you can download as a PNG.
        The QR is the underrated one &mdash; it goes on a poster, a flyer, a
        sticker on a record sleeve, the corner of a video &mdash; and it is
        rendered to scan reliably off a cheap phone camera in bad light rather
        than merely to look nice.
      </p>

      <ZoomableImage
        src="/help/share-qr.webp"
        alt="The Tune-in code dialog: a QR code for the station, under the suggestion to put it on a poster, a flyer, or the end of a set."
        width={840}
        height={852}
      />

      <h2>What Somebody Sees When You Paste It</h2>
      <p>
        Your station&#39;s artwork, name and description, in the preview card
        that chat apps and social networks build from a link. Which is the real
        reason to fill those in: the description is not decoration, it is the
        pitch that arrives before anybody presses play.
      </p>

      <h2>People Who Arrive While You Are Off Air</h2>
      <p>
        Most of them will. The{" "}
        <Link href="/help/your-player-page">player page</Link>{" "}handles it by
        offering a single field &mdash; an email address to be told the next
        time you go live &mdash; so a visitor who arrives at a silent station
        becomes an audience for your next one instead of leaving.
      </p>
      <p>
        If you broadcast to a schedule, put your show times in Station settings
        too. They appear on the player page, and &ldquo;back Thursday at
        8pm&rdquo; is a better answer than silence.
      </p>

      <h2>On Your Own Site</h2>
      <p>
        A link is fine, but a player people can press without leaving your page
        is better. See{" "}
        <Link href="/help/embed-the-player">embed the player on your site</Link>.
      </p>
    </>
  )
}
