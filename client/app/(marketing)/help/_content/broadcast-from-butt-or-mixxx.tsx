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
        On the <strong>Go live</strong>{" "}page, choose{" "}
        <strong>Use DJ software instead</strong>{" "}(a Pro feature). It lists
        the values below, each with its own Copy button, tells you if the
        station is off, and shows <strong>Connected</strong>{" "}once your
        software is on air.
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
        Copy them from there rather than typing them, and see{" "}
        <Link href="#where-these-go">where these go</Link>{" "}below for the
        exact spot in BUTT, Mixxx and ffmpeg.
      </p>

      <ZoomableImage
        src="/help/encoder-connection.webp"
        alt="The Use your own DJ software dialog: Server, Port, Mount, Username and a hidden Password, each with a Copy button, and Show beside the password."
        width={1200}
        height={952}
      />

      {/* scroll-mt: arriving from the dashboard's link, the heading clears the sticky header. */}
      <h2 id="where-these-go" className="scroll-mt-28">Where These Go in BUTT, Mixxx and ffmpeg</h2>
      <p>
        Each program names the values a little differently. Your values are on
        the Go live page under <strong>Use DJ software instead</strong>; the
        names below are where to paste them.
      </p>

      <h3>BUTT</h3>
      <ol>
        <li>Open <strong>Settings → Main → Server → Add</strong>.</li>
        <li>Set the type to <strong>Icecast</strong>.</li>
        <li><strong>Address</strong>: your Server. <strong>Port</strong>: your Port.</li>
        <li>
          <strong>Mountpoint</strong>: your Mount, exactly as shown
          (<code>/my-station</code>). With or without the slash both work: BUTT
          adds it when it is missing.
        </li>
        <li><strong>User</strong>: <code>source</code>. <strong>Password</strong>: your stream key.</li>
      </ol>

      <h3>Mixxx</h3>
      <ol>
        <li>Open <strong>Preferences → Live Broadcasting → Server connection</strong>.</li>
        <li>Set the type to <strong>Icecast 2</strong>.</li>
        <li>
          <strong>Host</strong>: your Server, the name only, with no{" "}
          <code>http://</code>{" "}in front. <strong>Port</strong>: your Port.
        </li>
        <li><strong>Mount</strong>: your Mount, with the slash.</li>
        <li><strong>Login</strong>: <code>source</code>. <strong>Password</strong>: your stream key.</li>
        <li>Then turn on <strong>Options → Enable Live Broadcasting</strong> to connect.</li>
      </ol>

      <h3>ffmpeg</h3>
      <p>
        Paste this into a terminal, with <code>SERVER</code>, <code>PORT</code>,{" "}
        <code>MOUNT</code>{" "}(slash included) and <code>KEY</code>{" "}swapped for
        your values:
      </p>
      <pre>
        <code>{`ffmpeg -re -i input.mp3 -c:a libmp3lame -b:a 128k -content_type audio/mpeg \\
  -f mp3 icecast://source:KEY@SERVER:PORT/MOUNT`}</code>
      </pre>

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
        station on. Press Start AutoDJ on the dashboard, then connect; your
        encoder takes over from AutoDJ the moment it does. An encoder
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

      <h2>Keep Your Key Private</h2>
      <p>
        The connection is not encrypted: your software sends the stream key as
        plain text. Treat it like a password on a shared network, and if you
        ever paste it somewhere public, make a new one in your station’s
        settings under <strong>Use your own DJ software → New key</strong>.
        A show already on air keeps running; the new key applies the next time
        your software connects.
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
