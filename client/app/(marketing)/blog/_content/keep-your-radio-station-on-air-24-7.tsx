import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        Most people who start a radio station discover the same thing in about
        week two: the station only exists while they&#39;re sitting in front of
        it. Close the browser tab, shut the laptop, and it goes quiet. Anyone
        who tunes in an hour later hears nothing, and doesn&#39;t try again.
      </p>
      <p>
        Broadcasting itself has been free here from the start, and stays that
        way &mdash; microphone, music from your laptop, a page you can share,
        a hundred people listening at once. What this release adds is the
        other half: your station carrying on without you, playing the music
        you uploaded, dropping in your own station IDs, and handing the
        microphone straight back the moment you go live.
      </p>
      <p>
        Here&#39;s what&#39;s new, what you get without paying, and how to get
        Pro if you want it.
      </p>

      <h2>Why Small Stations Go Quiet</h2>
      <p>
        A station that plays around the clock needs three things, and most
        home setups only manage two of them.
      </p>
      <p>
        It needs <strong>something to play when you&#39;re not there</strong>.
        It needs <strong>a link that keeps working</strong>{" "}
        even during the gaps, so listeners aren&#39;t knocked out of the stream and forced to
        find it again. And it needs <strong>a clean handover</strong>{" "} between
        you and the music, quick enough that nobody hears the join.
      </p>
      <p>
        That last one is the part that quietly loses you an audience. If your
        stream cuts out for a few seconds every time you sit down to talk,
        people learn to stop listening.
      </p>

      <h2>What&#39;s New</h2>

      <h3>Your Music Plays When You&#39;re Off</h3>
      <p>
        Upload tracks to your station, drag them into the order you want, and
        they play whenever you&#39;re not live &mdash; then start again from
        the top. We call it AutoDJ.
      </p>
      <p>
        It&#39;s your own music, not a shared pool of stock tracks, so you
        decide exactly what airs. That also means the licensing is yours to
        sort out, which we cover in our{" "}
        <Link href="/blog/how-to-start-an-internet-radio-station-2026">
          guide to starting an internet radio station
        </Link>{" "}
        . Each station gets 3&nbsp;GB of space &mdash; somewhere around 30 to
        35 hours of music, enough that a regular listener won&#39;t hear the
        same run twice in a day.
      </p>

      <h3>Going Live Takes Over Instantly</h3>
      <p>
        When you go live, the music stops and you&#39;re on. When you finish,
        the music picks back up. Listeners stay connected through both
        switches &mdash; nobody gets dropped, and nobody has to re-open the
        link.
      </p>
      <p>
        The same thing happens if your internet drops mid-show. Your listeners
        hear the station carry on instead of hearing silence, and you rejoin
        when you&#39;re back.
      </p>

      <h3>Station IDs and Jingles</h3>
      <p>
        Jingles are uploaded separately from your music and slot in
        automatically. You choose how often, two ways:
      </p>
      <ul>
        <li>
          <strong>By the clock</strong>{" "} &mdash; one every few minutes. Good for
          legal IDs and sponsor reads, because you know exactly when they land.
        </li>
        <li>
          <strong>By song count</strong>{" "} &mdash; one every few tracks. Good for
          station imaging, because it never lands in the middle of a song.
        </li>
      </ul>
      <p>
        They&#39;re played in random order from whatever you upload, so a
        handful of them doesn&#39;t start sounding like a loop.
      </p>

      <h3>Everything Sounds the Same Volume</h3>
      <p>
        Uploads get checked for two things: how loud they are, and whether
        there&#39;s dead air at the start or end. Both get corrected on
        playback. A quiet old recording and a loud new one sit at the same
        level, and a file with three seconds of nothing at the front
        doesn&#39;t put three seconds of nothing on your station.
      </p>

      <h3>An On/Off Switch for the Station Itself</h3>
      <p>
        Your station is now something you switch on, separate from you picking
        up the microphone. One button on the station page does it, and it
        always tells you where things stand: off air, starting up, on air,
        live, or &mdash; if something has gone wrong between you and your
        audience &mdash; not reaching listeners.
      </p>
      <p>
        If a station ends up on air making no sound at all, with nobody
        broadcasting and nothing queued to play, it switches itself off after a
        minute or two. A station playing music to an empty room is left alone;
        that&#39;s the feature working, not something to clean up.
      </p>

      <h3>You Can See What&#39;s Happening</h3>
      <p>
        The station page tells you where things stand at a glance: how many
        people are listening right now, what&#39;s playing, what&#39;s coming
        next, and how your last two weeks of shows went &mdash; including the
        biggest audience you pulled.
      </p>

      <h2>What You Get Without Paying</h2>
      <p>
        Free isn&#39;t a trial and it isn&#39;t a demo. There&#39;s no card,
        no countdown, and nothing that stops working after a fortnight. A free
        station is a real station:
      </p>
      <ul>
        <li>
          Broadcast from your browser &mdash; microphone, push-to-talk that
          ducks the music while you speak, and a drag-and-drop queue so you can
          play tracks off your own machine during the show.
        </li>
        <li>
          A hundred people can listen at once. For context, most small stations
          settle somewhere between ten and a hundred regulars, so that&#39;s
          not a starter allowance &mdash; it&#39;s room to actually grow into.
        </li>
        <li>
          A player page you can share anywhere, showing what&#39;s playing
          right now, plus a live count of who&#39;s tuned in.
        </li>
        <li>
          People who find your station while it&#39;s off can ask to be emailed
          the next time you go live &mdash; so an audience builds up between
          shows even when nothing is playing.
        </li>
        <li>
          As many broadcasts as you like, for as long as you like. Nothing is
          metered.
        </li>
      </ul>
      <p>
        Plenty of stations never need more than that. If you broadcast a show
        a week and tell people when you&#39;re on, free does the whole job. Pro
        is for when you want the station to be there between your shows.
      </p>

      <h2>Free vs Pro</h2>
      <table>
        <thead>
          <tr>
            <th>&nbsp;</th>
            <th>Free</th>
            <th>Pro &mdash; free in beta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Broadcast from your browser, push-to-talk, file queue</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Shareable player page with live track info</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Listeners emailed when you go live</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>How much you can broadcast</td>
            <td>Unmetered</td>
            <td>Unmetered</td>
          </tr>
          <tr>
            <td>Listeners at once</td>
            <td>100</td>
            <td>1,000</td>
          </tr>
          <tr>
            <td>Music plays 24/7 when you&#39;re off</td>
            <td>&mdash;</td>
            <td>3&nbsp;GB per station</td>
          </tr>
          <tr>
            <td>Jingles and station IDs</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Broadcast from BUTT, Mixxx or similar apps</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Stream link for TuneIn and Sonos</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Your own domain and listener stats</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
        </tbody>
      </table>

      <h2>How to Get Pro</h2>
      <p>
        Pro is in beta, and while it is, there&#39;s nothing to pay. We invite
        a few stations at a time, after looking at a real one &mdash; which is
        why you ask from inside your dashboard rather than from the pricing
        page. If we invite you in, you get everything above at no cost, for as
        long as the beta runs.
      </p>
      <ol>
        <li>
          <Link href="/auth/register">Sign up free</Link>{" "} and set your station
          up: name, genre, artwork.
        </li>
        <li>
          Open your station&#39;s <strong>Library</strong>{" "} page, or use{" "}
          <strong>Request access</strong>{" "} in the sidebar.
        </li>
        <li>
          Paste a link to a public page &mdash; Instagram, YouTube, TikTok,
          your own site, anywhere we can see who you&#39;re broadcasting to.
          The whole link, not just your handle.
        </li>
        <li>
          Tell us what you broadcast, how often, and what you need Pro for.
          It&#39;s optional, and it&#39;s the part that actually gets requests
          answered sooner.
        </li>
      </ol>
      <p>
        We use the email on your account, so there&#39;s nothing to fill in
        there, and there&#39;s no card to enter. Because we onboard in small
        batches it may be a while before you hear back.
      </p>
      <p>
        When billing does open, Pro will be $15 a month. We&#39;ll tell you
        before that happens rather than surprising you with a charge, and if
        you&#39;d rather stop there you can &mdash; your uploads stay yours
        either way. For where that sits against everything else a station pays
        for, see{" "}
        <Link href="/blog/how-much-does-it-cost-to-run-an-internet-radio-station">
          what it actually costs to run a station
        </Link>
        .
      </p>

      <h2>What&#39;s Coming Next</h2>
      <p>
        Scheduled shows are what we&#39;re building now: pick a time, and your
        show cuts into the rotation when it arrives, without you having to be
        there to press anything.
      </p>
      <p>
        Until then there&#39;s a workaround that gets you most of the way.
        Your library lists the length of every track and the total run time of
        the rotation, so you can add up where the loop lands and order it to
        suit &mdash; a two-hour block of music before the slot you care about
        puts you where you want to be. And because going live cuts in
        instantly, a show that starts at eight starts at eight: you press the
        button, the music stops, you&#39;re on.
      </p>
      <p>
        Separate logins for a team of DJs and a broadcasting app for your
        phone are further out, and we&#39;ll say so plainly rather than let
        you find out in week three.
      </p>
      <p>
        What is fixed is the thing that kills most small stations: going silent
        the moment the person running it walks away. A station that&#39;s
        always playing something gives people a reason to come back &mdash; and
        if you&#39;d rather do that with a weekly show and an email list,
        that&#39;s free, and it works too. Coming back is the whole game;
        there&#39;s more than one way to earn it.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>Does my station keep playing if I close my laptop?</h3>
      <p>
        On Pro, yes. Your uploaded music keeps playing and the link keeps
        working. On the free plan, broadcasting is live only &mdash; the
        station goes quiet when you close the tab and switches itself off a few
        minutes later. Your page stays up either way, and anyone who lands on
        it can ask to be emailed the next time you&#39;re on.
      </p>

      <h3>Do I need Pro to start a station?</h3>
      <p>
        No. Sign up, name your station and you can be broadcasting to a
        hundred people in about a minute, without entering a card. Most
        stations should start free and only look at Pro once they know they
        want to be on the air between shows.
      </p>

      <h3>What happens to the music when I go live?</h3>
      <p>
        It stops and you take over straight away. When you finish, it picks
        back up. Listeners stay connected through both, so nobody has to
        re-open the link.
      </p>

      <h3>How much music can I upload?</h3>
      <p>
        3&nbsp;GB per station, shared between your music and your jingles.
        That&#39;s roughly 30 to 35 hours.
      </p>

      <h3>How much does Pro cost right now?</h3>
      <p>
        Nothing, while it&#39;s in beta. You ask for it from your dashboard,
        and stations we invite in get the full thing without paying and
        without entering a card. Once billing opens it&#39;s $15 a month,
        and we&#39;ll give you notice before anyone is charged.
      </p>

      <h3>Can I use BUTT or Mixxx instead of the browser?</h3>
      <p>
        Broadcasting from desktop apps is part of Pro. Your station accepts the
        same connection any standard radio encoder uses, and the details come
        with your Pro onboarding.
      </p>
    </>
  )
}
