import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        You are on air, you are talking, and the player is silent. Work down
        this list &mdash; it is ordered by how often each one turns out to be
        the answer.
      </p>

      <h2>1. Give It Fifteen Seconds</h2>
      <p>
        There is roughly a fourteen-second buffer between your microphone and a
        listener&#39;s speakers. If you opened the player and heard nothing
        immediately, that is expected. Wait, then judge.
      </p>
      <p>
        The same buffer is why you should not monitor your own station in
        another tab while broadcasting. You will hear yourself from fourteen
        seconds ago, which is unusable, and it is easy to mistake for a fault.
      </p>

      <h2>2. Is the Mic Meter Moving?</h2>
      <p>
        In the studio, speak and watch the meter. If it does not move, no audio
        is entering the broadcast and nothing further down the chain can fix
        that.
      </p>
      <p>
        Almost always this is the browser using the wrong input &mdash; a
        built-in microphone when you meant your interface, or a headset that is
        connected but not selected. Check your browser&#39;s microphone
        permission for the site and which device it is set to, then reload the
        studio.
      </p>

      <h2>3. Check Encoder Health, Not the Level Meter</h2>
      <p>
        The studio shows how much audio has actually <em>left</em>{" "}your
        computer. This is the readout that matters, because a level meter
        happily bounces along through a completely dead connection &mdash; it
        sits before the point of failure.
      </p>
      <p>
        If lost time is climbing steadily, your upload is the problem. Close
        whatever else is using it, and use a cable rather than wifi if you can.
      </p>

      <h2>4. Does the Status Say &ldquo;Not Reaching Listeners&rdquo;?</h2>
      <p>
        Then it is not you. That status means your station is running and
        producing audio, but it is not getting out to listeners &mdash; a fault
        on our side. It usually clears by itself within a minute or two. If it
        does not, email <a href="mailto:hello@gocast.fm">hello@gocast.fm</a>{" "}
        with your station name and roughly when it started, and do not bother
        rebuilding anything in the meantime.
      </p>

      <h2>Still Nothing?</h2>
      <p>
        Two quick sanity checks before you write to us. Open your{" "}
        <Link href="/help/your-player-page">player page</Link>{" "}on a phone, on
        mobile data rather than your wifi &mdash; that rules out your own
        network and your own browser in one go. And check the station really is
        on air rather than showing{" "}
        <Link href="/help/turning-your-station-on-and-off">Off air</Link>, which
        is easy to miss when you are looking at a studio that seems alive.
      </p>
    </>
  )
}
