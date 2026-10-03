import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        The big card at the top of your station’s <strong>Overview</strong>{" "}
        says whether anybody can hear anything, and holds the buttons that
        change it: going live, starting AutoDJ, turning the station off. The
        strip at the top of every dashboard page shows the same status, with a
        shortcut to the next thing you’d want to do.
      </p>

      <h2>Two Questions, Not One</h2>
      <p>
        The station page answers them separately, and keeping them apart is the
        key to reading it:
      </p>
      <ul>
        <li>
          <strong>Can anyone hear this station?</strong>{" "}That is power. A
          station only holds a broadcast server while it is switched on, which
          is why an off-air station has no stream, no listener count and no
          now-playing.
        </li>
        <li>
          <strong>What are they hearing?</strong>{" "}That is the source &mdash;
          you, live; or AutoDJ; or nothing yet.
        </li>
      </ul>
      <p>
        Being live is not a bigger version of being on air. It is being on air{" "}
        <em>with a person as the source</em>.
      </p>

      <ZoomableImage
        src="/help/station-power.webp"
        alt="The top card of a station's Overview while it is off air: Off air, Nothing's playing right now, with Go live now and Start AutoDJ buttons, and Listening now beside it."
        width={2480}
        height={448}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>What Each Status Means</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>What is true</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Off air</strong></td>
            <td>No server, no stream. The player page shows the notify field.</td>
          </tr>
          <tr>
            <td><strong>Starting…</strong></td>
            <td>The server is coming up. A few seconds, normally.</td>
          </tr>
          <tr>
            <td><strong>Live</strong></td>
            <td>A person is broadcasting, from the studio or an encoder.</td>
          </tr>
          <tr>
            <td><strong>On air · AutoDJ</strong></td>
            <td>
              The station is running with nobody live: AutoDJ (Pro) is playing
              your music. The card says which playlist.
            </td>
          </tr>
          <tr>
            <td><strong>No sound</strong></td>
            <td>
              The station is running but playing silence &mdash; usually AutoDJ
              with nothing to play. Add tracks to AutoDJ’s playlist, or go live.
            </td>
          </tr>
          <tr>
            <td><strong>Checking&hellip;</strong> / <strong>Status unknown</strong></td>
            <td>
              The dashboard hasn&rsquo;t heard back from the station yet. This
              says nothing about what listeners hear; it clears on the next
              answer.
            </td>
          </tr>
          <tr>
            <td><strong>Not reaching listeners</strong></td>
            <td>
              The station is running and producing audio, but it is not getting
              out. Nobody can hear it. This one is ours to fix &mdash; if it
              does not clear by itself in a minute or two, email us.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>The Buttons</h2>
      <ul>
        <li>
          <strong>Go live now</strong>{" "}opens the studio, where you check your
          mic and running order before you go on air from your browser. If
          AutoDJ is playing, it pauses until you finish.
        </li>
        <li>
          <strong>Start AutoDJ</strong>{" "}(Pro) switches the station on and
          plays your music with nobody live.
        </li>
        <li>
          <strong>Turn station off</strong>{" "}&mdash; it reads{" "}
          <strong>Stop AutoDJ</strong>{" "}while AutoDJ is playing, and asks first
          &mdash; stops everything. Anyone listening is cut off, and the player
          page shows the station as off air.
        </li>
      </ul>
      <p>
        If you are live from another browser or computer, the card says{" "}
        <strong>You’re live from another browser</strong>{" "}and has no stop
        button. End the
        show from the studio in that browser: stopping it from here would only
        make that studio reconnect and start the station again.
      </p>

      <h2>Going Live Switches It On For You</h2>
      <p>
        You never have to press power first. Starting a broadcast starts the
        station as part of the same action, because there is no sense in which
        somebody wants to be live on a station that is switched off.
      </p>

      <h2>Stopping</h2>
      <p>
        Going off air ends the broadcast for everybody currently listening and
        releases the server. If an external encoder is connected, the app will
        say so and ask you to confirm before cutting it off, rather than
        quietly pulling the rug from under a show running in another
        application.
      </p>
      <p>
        Stations also stop <em>themselves</em>{" "}after ten minutes of producing no
        audio with nobody attached &mdash; see{" "}
        <Link href="/help/my-station-went-off-air">
          my station went off air on its own
        </Link>
        .
      </p>
    </>
  )
}
