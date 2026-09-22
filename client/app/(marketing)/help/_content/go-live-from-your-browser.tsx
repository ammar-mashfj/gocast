import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        You need a browser and a microphone. No software to install, nothing to
        configure, and it works on the free plan.
      </p>

      <h2>Going On Air</h2>
      <ol>
        <li>
          On your station page, press <strong>Go live</strong>{" "}and choose
          broadcasting from this browser.
        </li>
        <li>
          Your browser asks for microphone access. Say yes &mdash; this prompt
          is the whole security model, and if you dismiss it nothing can work.
        </li>
        <li>
          The studio opens. Check the mic meter is moving when you speak, then
          start.
        </li>
      </ol>
      <p>
        You do not need to switch the station on first. Going live does that as
        part of the same action.
      </p>

      <h2>You Are About Fourteen Seconds Ahead of Your Listeners</h2>
      <p>
        There is a buffer between your microphone and somebody&#39;s speakers,
        and it is not small &mdash; roughly fourteen seconds. This is normal for
        internet radio and it is the price of a stream that does not stutter.
      </p>
      <p>
        It has two practical consequences. Do not monitor your own station in
        another tab while broadcasting &mdash; you will hear yourself from
        fourteen seconds ago and it is impossible to talk over. And when you
        take a request from a chat, the person asking is reacting to something
        you said a quarter of a minute earlier.
      </p>

      <h2>What Ends Your Broadcast</h2>
      <ul>
        <li>
          <strong>Closing the tab.</strong>{" "}This is the one to know. The
          broadcast lives in the tab, so closing it ends the show.
        </li>
        <li>
          <strong>Refreshing is survivable.</strong>{" "}An accidental reload picks
          the broadcast back up rather than dropping you.
        </li>
        <li>
          <strong>A wifi hiccup is survivable.</strong>{" "}A dropped connection
          reconnects by itself, and listeners stay connected through it.
        </li>
        <li>
          <strong>Following a link out of the dashboard.</strong>{" "}Anything that
          leaves the app takes the broadcast with it. Help links from inside the
          dashboard open in a new tab for exactly this reason &mdash; treat
          anything else the same way, and middle-click it.
        </li>
      </ul>

      <h2>On a Phone</h2>
      <p>
        It works, with one rule: keep the tab in the foreground. Mobile browsers
        aggressively throttle background tabs, and a throttled tab is a
        broadcast that stutters and dies. Do not switch apps mid-show. For
        anything longer than a few minutes, a laptop is the safer instrument.
      </p>

      <h2>Ending It</h2>
      <p>
        Stop the broadcast from the studio. If you have AutoDJ, the music picks
        up where it should be and your listeners stay connected through the
        handover &mdash; no one has to reopen the link. Without AutoDJ, the
        station goes off air shortly afterwards, because there is nothing left
        for it to play.
      </p>
      <p>
        Either way there is a tail: the last ten seconds or so of what you said
        is still travelling to listeners after you press stop. Do not slam the
        laptop shut on your own sign-off.
      </p>
      <p>
        Next:{" "}
        <Link href="/help/using-the-studio">what the studio actually does</Link>.
      </p>
    </>
  )
}
