import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        Stations take themselves off air after{" "}
        <strong>ten minutes of producing no audio with nothing attached that
        could start producing some</strong>. That is the whole rule, and it
        explains almost every case of a station stopping on its own.
      </p>

      <h2>What Does Not Cause It</h2>
      <p>
        <strong>Having no listeners.</strong>{" "}Listener count plays no part in
        this decision at all. A rotation playing to an empty room is exactly the
        thing you are paying for, and stopping it would be an outage rather than
        a saving. Your station will happily play to nobody indefinitely.
      </p>
      <p>
        <strong>A muted microphone.</strong>{" "}Once you are connected, you are
        connected. Dead air while you find a record does not stop your station,
        and neither does a five-minute silence you left on purpose.
      </p>

      <h2>What Does Cause It</h2>
      <ul>
        <li>
          <strong>Switching on and then not connecting.</strong>{" "}The classic:
          you put the station on air, went to set up your encoder, and took more
          than ten minutes. Nothing was attached and nothing was playing, so it
          reads exactly like an abandoned station.
        </li>
        <li>
          <strong>Ending a live broadcast with no AutoDJ.</strong>{" "}On the free
          plan there is nothing to fall back to, so the station goes quiet and
          then stops. This is normal and not a fault &mdash; it is how the{" "}
          <Link href="/help/free-and-pro">free plan</Link>{" "}works.
        </li>
        <li>
          <strong>An empty or broken rotation.</strong>{" "}AutoDJ with nothing in
          it produces silence, and silence with nothing to play is an idle
          station.
        </li>
      </ul>

      <h2>If It Stopped With a Full Rotation</h2>
      <p>
        That is different, and we want to know about it. A station that had
        music to play and was emitting nothing is a fault, not an idle station,
        and the system can tell the two apart. Email{" "}
        <a href="mailto:hello@gocast.fm">hello@gocast.fm</a>{" "}with your station
        name and roughly when it happened.
      </p>

      <h2>Avoiding It</h2>
      <p>
        Connect your encoder first and switch the station on second, or at least
        do the two close together. If you want a station that is simply always
        up, give it a{" "}
        <Link href="/help/playlists-and-the-rotation">default playlist</Link>{" "}
        with something in it &mdash; a station with audio to play is never
        stopped by this.
      </p>
    </>
  )
}
