import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        BUTT, Mixxx or RadioDJ refusing to connect is nearly always one of five
        things, and the error messages are unhelpfully similar &mdash; most of
        these look like a wrong password.
      </p>

      <h2>1. The Type Is Set to Shoutcast</h2>
      <p>
        It has to be <strong>Icecast 2</strong>. They are different protocols,
        and a Shoutcast client fails against your station with an
        authentication-shaped error even when every value you typed is correct.
        This is the most common cause by a distance.
      </p>

      <h2>2. There Is a http:// in the Server Field</h2>
      <p>
        The server field wants a hostname and nothing else &mdash; no{" "}
        <code>http://</code>, no <code>https://</code>, no trailing slash, no
        path. Mixxx is especially strict about this, and pasting a URL into it
        is the second most common cause.
      </p>

      <h2>3. The Station Is Off Air</h2>
      <p>
        Unlike the browser studio, an encoder does not switch your station on.
        Put it on air from the dashboard first, then connect.
      </p>
      <p>
        There is a related trap: a station that is on air with nothing attached
        and nothing playing takes itself off air after ten minutes. If you
        switched it on, went to configure your encoder, and took a while, it may
        have stopped underneath you. Switch it back on and connect promptly.
      </p>

      <h2>4. The Mount Has the Wrong Number of Slashes</h2>
      <p>
        Encoders disagree about this. BUTT adds the leading slash itself, so you
        type the mount <em>without</em>{" "}one; Mixxx wants it exactly as shown on
        your settings page, <em>with</em>{" "}the slash. Copy from the per-client
        instructions on the settings page rather than from the field above them
        &mdash; they are written out per encoder for this reason.
      </p>

      <h2>5. Something Else Is Already Connected</h2>
      <p>
        A station takes one broadcaster at a time. If a browser studio is live,
        or an encoder is still connected from earlier, a second connection is
        refused. Check what the station page says it is live from &mdash; it
        names the software where it can &mdash; and disconnect that first.
      </p>
      <p>
        An encoder that crashed rather than disconnecting cleanly can hold the
        slot for a short while. Taking the station off air and back on clears it.
      </p>

      <h2>Other Things Worth Ruling Out</h2>
      <ul>
        <li>
          <strong>The username is <code>source</code></strong>, not your email
          address and not your station name.
        </li>
        <li>
          <strong>Your plan.</strong>{" "}Encoder broadcasting needs Pro. On Free
          the credentials are not offered at all &mdash; if you cannot find them
          on your settings page, that is why. See{" "}
          <Link href="/help/free-and-pro">Free and Pro</Link>.
        </li>
        <li>
          <strong>A rotated key.</strong>{" "}If you pressed New key, every encoder
          holding the old one stops working until you paste the new one in.
        </li>
        <li>
          <strong>A restrictive network.</strong>{" "}Some office and campus
          networks block outbound streaming ports. Try tethering to a phone as a
          test &mdash; if it connects there, it is the network, not the setup.
        </li>
      </ul>

      <p>
        Still stuck? Email{" "}
        <a href="mailto:hello@gocast.fm">hello@gocast.fm</a>{" "}with the software,
        its version, and the exact error text. See also{" "}
        <Link href="/help/broadcast-from-butt-or-mixxx">
          broadcasting from BUTT, Mixxx or RadioDJ
        </Link>
        .
      </p>
    </>
  )
}
