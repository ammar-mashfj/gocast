import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        Your station page has one control that decides whether anybody can hear
        anything: the power button. Everything else &mdash; going live,
        skipping a track, going off air &mdash; lives beside it in the same
        place, so there is never a second button that also means
        &ldquo;begin&rdquo;.
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
        alt="The two cards on a station page: the power card reading On air with Take over live and Take off air, and beside it the now playing card showing the AutoDJ track and what is up next."
        width={2088}
        height={440}
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
            <td><strong>On air</strong></td>
            <td>Listeners can hear you. The source chip beside it says what from.</td>
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
