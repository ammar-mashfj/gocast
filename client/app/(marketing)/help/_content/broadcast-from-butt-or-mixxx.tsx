import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        Your station speaks the <strong>Icecast 2 source protocol</strong>, so
        anything that can broadcast to an Icecast server can broadcast to it:
        BUTT, Mixxx, RadioDJ, Audio Hijack, SAM, ffmpeg, and most things like
        them.
      </p>
      <p>
        This is what you want if you already have a setup &mdash; a mixer, a
        processing chain, a library in RadioDJ &mdash; and the browser studio
        is not where your show lives.
      </p>

      <h2>Your Connection Details</h2>
      <p>
        Five values, on your station&#39;s settings page under the encoder
        section. The same panel appears in the Go live dialog when you choose to
        broadcast from an encoder, so you do not have to go hunting mid-setup.
      </p>
      <ul>
        <li><strong>Server</strong>{" "}&mdash; the hostname</li>
        <li><strong>Port</strong></li>
        <li><strong>Mount</strong>{" "}&mdash; some software calls this the mountpoint or the path</li>
        <li><strong>Username</strong>{" "}&mdash; always <code>source</code></li>
        <li>
          <strong>Password</strong>{" "}&mdash; your stream key. Some software calls
          it the source password or the login.
        </li>
      </ul>
      <p>
        The settings page lists the exact menu path for BUTT, Mixxx and ffmpeg
        with your own values already filled in. Use that rather than typing from
        this page.
      </p>

      <ZoomableImage
        src="/help/encoder-connection.webp"
        alt="The encoder panel on the station settings page, listing Server, Port, Mount, Username and a masked Password, with a copy button beside each one."
        width={1400}
        height={948}
      />

      <h2>Set the Type to Icecast 2</h2>
      <p>
        Not Shoutcast. They are different protocols and a Shoutcast client will
        fail against your station with an error that looks like a wrong
        password. This is the most common first mistake.
      </p>
      <p>
        And not OBS: OBS sends RTMP, which is video streaming. It cannot
        publish to a radio station at all.
      </p>

      <h2>Switch the Station On First</h2>
      <p>
        Unlike the browser studio, connecting an encoder does not switch your
        station on. Put it on air from the dashboard, then connect. An encoder
        pointed at a station that is off air has nothing to connect to.
      </p>
      <p>
        Do not leave a long gap between the two, either. A station that is on
        air with nothing attached and nothing playing takes itself off air after
        ten minutes, and the symptom is an encoder that connects successfully
        to a station that has just gone away.
      </p>

      <h2>One Source at a Time</h2>
      <p>
        A station accepts one broadcaster. While your encoder is connected, the
        browser studio cannot take over &mdash; the dashboard will tell you the
        station is live from your encoder and will name the software where it
        can, rather than offering you a studio that could not work.
      </p>
      <p>
        To swap, disconnect the encoder first. And if you go off air from the
        dashboard while an encoder is connected, you are asked to confirm,
        because that cuts off a show running in another application.
      </p>

      <h2>If It Will Not Connect</h2>
      <p>
        See{" "}
        <Link href="/help/my-encoder-wont-connect">
          my encoder will not connect
        </Link>{" "}
        &mdash; five causes account for nearly all of it, and one of them is a{" "}
        <code>http://</code>{" "}that should not be there.
      </p>
    </>
  )
}
