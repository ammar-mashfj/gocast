import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        You can go live on GoCast from a phone. Open your station in the
        browser, tap Go Live, and you&#39;re on air with the same microphone,
        queue and push-to-talk as the laptop studio. For a quick show, a
        check-in from somewhere without a laptop, or a test before the real
        thing, it works well.
      </p>
      <p>
        It works as long as the studio stays on screen. Phones are built to
        save battery, and they put away anything you aren&#39;t looking at,
        whether you want them to or not. This article covers exactly where
        that line is: what we do to keep you on air, what makes the broadcast
        stop, and what your listeners hear when it does.
      </p>

      <h2>The One Rule</h2>
      <p>
        <strong>Keep the studio in the foreground, with the screen on.</strong>{" "}
        As long as the tab is the thing on your screen, your phone broadcasts
        like a laptop does. The moment it isn&#39;t, whether you switched
        apps, locked the phone, or let the screen go dark, the browser pauses
        the page, and a paused page can&#39;t send audio.
      </p>
      <p>
        That&#39;s not something we chose, and it isn&#39;t something a web
        page can get around. iOS and Android both decide what a background
        browser tab is allowed to do, and keeping a microphone open and
        streaming isn&#39;t on the list. Any service that broadcasts from a
        mobile browser is bound by the same rule.
      </p>

      <h2>What We Do to Keep You On Air</h2>

      <h3>The Screen Stays Awake</h3>
      <p>
        Once you&#39;re live, the studio asks your phone to keep the screen
        on. You can put the phone on a stand, talk for an hour without
        touching it, and it won&#39;t dim or lock itself halfway through a
        sentence. When you end the broadcast, the screen goes back to its
        normal timeout.
      </p>
      <p>
        This works in current versions of Safari, Chrome, Firefox and most
        browsers based on them. There are two cases where the phone can say
        no:
      </p>
      <ul>
        <li>
          <strong>Battery saver or Low Power Mode is on.</strong>{" "}Some phones
          refuse to keep the screen awake while saving power. The studio
          can&#39;t tell you it was refused; the screen just dims on its
          usual timer.
        </li>
        <li>
          <strong>An older browser.</strong>{" "}If your browser doesn&#39;t
          support keeping the screen on, the same thing happens.
        </li>
      </ul>
      <p>
        Either way the fix is the same: turn battery saver off for the show,
        or set your screen timeout to &ldquo;never&rdquo; before you start.
      </p>

      <h3>It Holds On Through a Dropped Connection</h3>
      <p>
        If your connection drops mid-show, from a wifi dead spot or a lift or
        a train going through a tunnel, the studio doesn&#39;t give up. Your
        microphone, your queue and your place in the current track all stay
        exactly where they were, and the studio keeps trying to reconnect for
        up to two minutes. When it gets through, you land mid-sentence with
        nothing to set up again.
      </p>

      <h3>Coming Back Reconnects Straight Away</h3>
      <p>
        Background tabs have their timers slowed to about once a minute, so a
        studio waiting between reconnect attempts could sit there doing
        nothing long after you&#39;d come back. It doesn&#39;t: the moment
        the studio is on screen again it tries immediately, and it asks for
        the screen to stay awake again, because the phone let go of that
        request when you left.
      </p>

      <h3>Push-to-Talk Lets Go When You Leave</h3>
      <p>
        If you&#39;re holding the talk button and the studio loses focus
        &mdash; a notification you tap, the control centre pulled down, an
        app switch &mdash; the microphone closes and the music comes back up.
        Nobody is left listening to the inside of your pocket. If you locked
        the mic open, it stays locked; that&#39;s what locking it is for.
      </p>

      <h2>Every Scenario, and What Happens</h2>
      <table>
        <thead>
          <tr>
            <th>What you do</th>
            <th>What happens</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Leave the studio open and put the phone down</td>
            <td>Keeps broadcasting. The screen stays on.</td>
          </tr>
          <tr>
            <td>Battery saver on, and the screen times out</td>
            <td>The screen dims, then locks. Once it locks, the broadcast stops.</td>
          </tr>
          <tr>
            <td>Press the power button to lock the phone</td>
            <td>The broadcast stops.</td>
          </tr>
          <tr>
            <td>Swipe home, or switch to another app</td>
            <td>The broadcast stops.</td>
          </tr>
          <tr>
            <td>Switch to another tab in the same browser</td>
            <td>The broadcast stops. To the phone, a hidden tab is the same as a closed app.</td>
          </tr>
          <tr>
            <td>Pull down notifications or the control centre, then close it</td>
            <td>Usually carries on. Push-to-talk lets go, so hold it again.</td>
          </tr>
          <tr>
            <td>Answer a phone call</td>
            <td>The call takes the microphone, and the broadcast stops.</td>
          </tr>
          <tr>
            <td>Lose signal for a moment</td>
            <td>The studio reconnects on its own within two minutes, as long as it stays on screen.</td>
          </tr>
          <tr>
            <td>Come back to the studio within two minutes</td>
            <td>It reconnects straight away and you carry on where you left off.</td>
          </tr>
          <tr>
            <td>Come back after longer than that</td>
            <td>The broadcast has ended. Go live again; the studio offers to pick your queue up where you left it.</td>
          </tr>
        </tbody>
      </table>
      <p>
        On some Android phones a broadcast can keep going for a little while
        after you switch away. Don&#39;t count on it. It depends on the
        phone, the browser and how much memory is free, and the same phone
        can behave differently from one day to the next.
      </p>

      <h2>What Your Listeners Hear</h2>
      <p>
        When the studio stops sending audio, your listeners hear several more
        seconds of what was already on its way to them, and then it depends on
        your station:
      </p>
      <ul>
        <li>
          <strong>With AutoDJ (Pro).</strong>{" "}Your music takes over after a
          few seconds, and your listeners stay connected. When you come back
          and reconnect, you take over again. For a listener, it sounds as if
          you went to a song.
        </li>
        <li>
          <strong>Without AutoDJ.</strong>{" "}They hear silence. If you
          aren&#39;t back within about two and a half minutes, the station
          switches itself off, and you&#39;ll need to go live again to bring
          it back.
        </li>
      </ul>
      <p>
        That&#39;s the strongest case for AutoDJ on a phone. It doesn&#39;t
        stop the phone pausing the studio, but it means a missed call costs
        you a song instead of your audience.
      </p>

      <h2>When the Audio Goes Quiet but You&#39;re Still Connected</h2>
      <p>
        There&#39;s one more case to know about, mostly on iPhones. After an
        interruption, such as a call, an alarm or a video playing in another
        app, the phone can come back with the studio&#39;s audio paused. You
        still look connected, but you&#39;re sending silence. The studio
        notices this and tells you, and the next tap anywhere in the studio
        switches the audio back on.
      </p>

      <h2>A Checklist Before You Go Live on a Phone</h2>
      <ol>
        <li>
          <strong>Plug it in.</strong>{" "}A screen held on for an hour, with the
          microphone and the network busy, uses a lot of battery, and a phone
          that drops into battery saver halfway through can stop holding the
          screen on.
        </li>
        <li>
          <strong>Turn on Do Not Disturb.</strong>{" "}It keeps calls and
          notifications from pulling you out of the studio. Check that it
          silences calls, not only notifications.
        </li>
        <li>
          <strong>Turn off battery saver or Low Power Mode</strong>{" "}for the
          length of the show, or set your screen timeout to &ldquo;never&rdquo;
          as a backup.
        </li>
        <li>
          <strong>Use wifi if you can.</strong>{" "}The studio rides out short
          drops, but a steady connection means you won&#39;t need it to.
        </li>
        <li>
          <strong>Use headphones</strong>{" "}if you&#39;re playing music from
          the queue, so the microphone picks up your voice and not the
          speaker.
        </li>
        <li>
          <strong>Open everything you need before you start.</strong>{" "}Notes,
          a running order, the track list: put them on paper or on another
          device. Any app you check mid-show pauses the broadcast.
        </li>
      </ol>

      <h2>When to Use Something Else</h2>
      <p>
        A phone is fine for a short show you can give your full attention. For
        anything long, or anything you&#39;ll need to read or look things up
        during, a laptop is the safer choice. A laptop browser keeps
        broadcasting even when the studio isn&#39;t the window in front, as
        long as you don&#39;t close the tab or put the laptop to sleep. The{" "}
        <Link href="/help/go-live-from-your-browser">
          going live from your browser
        </Link>{" "}
        guide covers the laptop side.
      </p>
      <p>
        On Pro you can also broadcast from desktop apps like BUTT or Mixxx,
        which don&#39;t depend on a browser tab at all. A broadcasting app for
        phones is on our list, but it&#39;s further out, and we&#39;d rather
        tell you that plainly than leave you to find out mid-show.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>Can I broadcast from my phone with the screen off?</h3>
      <p>
        No. Locking the phone pauses the browser, and a paused browser
        can&#39;t send audio. While you&#39;re live, the studio keeps the
        screen on for you so it doesn&#39;t lock on its own.
      </p>

      <h3>Why does my screen still dim while I&#39;m live?</h3>
      <p>
        Your phone refused the request to keep the screen on, usually because
        battery saver or Low Power Mode is on, or because the browser is too
        old to support it. Turn battery saver off, or set the screen timeout
        to &ldquo;never&rdquo; for the show.
      </p>

      <h3>Can I check another app while I&#39;m broadcasting?</h3>
      <p>
        Not without stopping the broadcast. If you&#39;re back within two
        minutes the studio reconnects straight away, but your listeners will
        have heard a gap, or your AutoDJ music if you&#39;re on Pro.
      </p>

      <h3>What happens if someone calls me mid-show?</h3>
      <p>
        The call takes the microphone and the broadcast stops. Hang up and go
        back to the studio within two minutes and you&#39;re back on air. Turn
        on Do Not Disturb before you start so calls can&#39;t come through.
      </p>

      <h3>Does this work on both iPhone and Android?</h3>
      <p>
        Yes, with the same rule on both: keep the studio on screen. Some
        Android phones keep a background tab going for a little longer, but
        not reliably enough to plan a show around.
      </p>
    </>
  )
}
