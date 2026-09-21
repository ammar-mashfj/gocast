import Link from "next/link"
import { ZoomableImage } from "../ZoomableImage"

/**
 * Launch post for AutoDJ playlists + weekly slots. The screenshots are real
 * captures of the dashboard, kept in /public/blog/schedule — retake them
 * rather than touching them up if the UI moves.
 */
export default function Body() {
  return (
    <>
      <p>
        Until now your station had one rotation. Everything you uploaded sat in
        a single list, played in the order you dragged it into, and started
        again at the top &mdash; the same run at seven in the morning as at
        midnight on a Saturday.
      </p>
      <p>
        That&#39;s changed. You can now build as many playlists as you want out
        of your library, and say which one plays on which days between which
        hours. Breakfast is quiet, drive time has a pulse, the news runs at
        six, last week&#39;s podcast goes out again on Wednesday evening, and
        late Friday is something else entirely &mdash; none of it needing you
        to be awake.
      </p>

      <h2>What a Schedule Looks Like</h2>
      <p>
        A schedule is a list of slots. Each slot is a playlist, a set of days
        and a start and end time &mdash; and an optional label, because
        &ldquo;Drive time&rdquo; is easier to scan than 16:00.
      </p>
      <ZoomableImage
        src="/blog/schedule/slots.webp"
        alt="Six scheduled slots: Breakfast, Drive time, a News at Six bulletin on weekdays from 6pm, a Podcast replay on Wednesday evenings, After hours on Friday and Saturday nights, and Weekend brunch."
        width={1558}
        height={778}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />
      <p>
        Underneath, the same week is drawn out so you can see the shape of it
        rather than read it. Gaps are where nothing is scheduled, and your
        default playlist fills them.
      </p>
      <ZoomableImage
        src="/blog/schedule/week.webp"
        alt="A week grid from midnight to midnight, with coloured bars showing when each playlist plays: music through the day, a short news block every weekday evening, a podcast on Wednesday, and a late-night slot that wraps past midnight into the following day."
        width={1558}
        height={309}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />
      <p>
        Look at Friday and Saturday night in that picture. A slot that runs
        23:00 to 02:00 crosses midnight, so it shows up twice &mdash; at the
        right edge of the day it starts on, and again at the left edge of the
        next morning. You write it once.
      </p>

      <h2>Playlists Come First</h2>
      <p>
        Slots point at playlists, so playlists are where you start. Your
        library now has a rail down the side: every playlist you&#39;ve made,
        how many tracks are in each and how long each one runs.
      </p>
      <ZoomableImage
        src="/blog/schedule/library.webp"
        alt="The music library with a playlist rail on the left listing Main rotation, Morning Coffee, Afternoon Drive, News Bulletin, The Long Way Round, Late Night and Weekend Sessions, and the tracks of the selected playlist on the right."
        width={1562}
        height={673}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />
      <p>
        A few things worth knowing about how they behave:
      </p>
      <ul>
        <li>
          <strong>A track can be in as many playlists as you like.</strong>{" "}
          It&#39;s stored once and counted against your 3&nbsp;GB once. Putting
          the same song in Breakfast and in Weekend brunch costs you nothing.
        </li>
        <li>
          <strong>Each playlist remembers its own place.</strong> Leave one
          part-way through and come back to it tomorrow and it carries on
          where it stopped, rather than restarting from the top every time its
          slot comes round.
        </li>
        <li>
          <strong>Shuffle is per playlist.</strong> Flip it on and that
          playlist deals itself a fresh random order each time it runs out
          &mdash; every track airs once before any track airs twice. Sequential
          playlists play exactly as you dragged them.
        </li>
        <li>
          <strong>One playlist is the default.</strong> It&#39;s what plays
          whenever no slot covers the current moment, it&#39;s where uploads
          land when you don&#39;t say otherwise, and it can&#39;t be deleted.
          You can move the badge to a different playlist any time.
        </li>
      </ul>

      <h2>It Doesn&#39;t Have to Be Music</h2>
      <p>
        Nothing about a playlist says it has to hold songs. It holds audio
        files, and the schedule decides when they air &mdash; which is the
        whole of what a talk station needs.
      </p>
      <ul>
        <li>
          <strong>A news bulletin at a fixed time.</strong> Drop your recorded
          bulletins into their own playlist and give it a short slot &mdash;
          six o&#39;clock to half past, weekdays. Drive time ends exactly where
          the news begins, because slots are allowed to touch.
        </li>
        <li>
          <strong>A podcast repeat.</strong> Put the last few episodes in a
          playlist and hand it an hour on a Wednesday evening. People who
          missed it live catch it on air, and the episodes carry over to the
          following week because each playlist keeps its own place.
        </li>
        <li>
          <strong>A syndicated or pre-recorded show.</strong> A guest mix, a
          sponsored half-hour, a language programme on Sunday mornings &mdash;
          all the same shape: a playlist, some days, two times.
        </li>
      </ul>
      <p>
        Mixing the two is the point. A station can run music most of the day,
        break for the news, and come back to music without anyone touching it.
      </p>

      <h2>Knowing What&#39;s On</h2>
      <p>
        The top of the schedule page answers the only question that matters
        when you open it: what is my station playing right now, and what
        happens next.
      </p>
      <ZoomableImage
        src="/blog/schedule/on-now.webp"
        alt="An On now bar reading: News Bulletin, until 18:30, then Main rotation."
        width={1565}
        height={88}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />
      <p>
        The same line shows on your station page, above the tracks that are
        actually queued &mdash; so you can tell at a glance whether the station
        is running the playlist you meant it to.
      </p>
      <ZoomableImage
        src="/blog/schedule/rotation.webp"
        alt="The AutoDJ rotation card on the station page, showing News Bulletin playing until 18:30 then Main rotation, with the two bulletins queued underneath."
        width={1186}
        height={169}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>How the Switch Actually Happens</h2>
      <p>
        This is the part worth being precise about, because it&#39;s where
        people&#39;s expectations and what a radio station can do tend to part
        company.
      </p>
      <p>
        <strong>Slots change at the next track boundary, never mid-song.</strong>{" "}
        If your drive-time slot starts at 16:00 and a six-minute track started
        at 15:58, drive time starts when that track ends. In practice a slot
        can begin a couple of minutes after the time written next to it. If you
        need something to hit the top of the hour exactly, that&#39;s a live
        broadcast, not a slot.
      </p>
      <p>
        <strong>Going live still beats everything.</strong> A slot decides what
        AutoDJ plays when AutoDJ is what&#39;s playing. The moment you pick up
        the microphone you&#39;re on, mid-slot or not, and when you finish the
        schedule picks up wherever it should be by then.
      </p>
      <p>
        <strong>Slots don&#39;t turn your station on or off.</strong> An empty
        Tuesday morning doesn&#39;t mean silence &mdash; it means your default
        playlist. The station&#39;s power button is still a separate thing you
        control, as described in{" "}
        <Link href="/blog/keep-your-radio-station-on-air-24-7">
          the 24/7 release
        </Link>
        .
      </p>
      <p>
        <strong>Days are when a slot starts.</strong> A Friday 22:00&ndash;02:00
        slot is a Friday slot, even though most of it happens on Saturday. Tick
        Friday, not Saturday.
      </p>
      <p>
        <strong>Slots can touch but not overlap.</strong> Two playlists
        can&#39;t both be on air, so an overlap is flagged in red and the
        schedule won&#39;t save until you fix it. A slot ending at 10:00 and
        the next starting at 10:00 is fine.
      </p>

      <h2>Setting One Up</h2>
      <ol>
        <li>
          Open your station&#39;s <strong>AutoDJ</strong> page and make a
          playlist from the rail on the left. <strong>Add from library</strong>{" "}
          pulls in tracks you&#39;ve already uploaded; you can also drop new
          files straight into it.
        </li>
        <li>
          Switch to the <strong>Schedule</strong> tab and check the timezone at
          the top. Your slots are written in that clock, and it&#39;s the same
          one your advertised show times use.
        </li>
        <li>
          <strong>Add slot</strong>, pick the playlist, tap the days it runs on
          and set the start and end time. Give it a label if it helps you.
        </li>
        <li>
          <strong>Save schedule.</strong> Nothing restarts and no listener is
          dropped &mdash; the change is picked up at the next track boundary.
        </li>
      </ol>
      <p>
        You can keep going up to fifty slots, which is more week than anyone
        needs.
      </p>

      <h2>What This Isn&#39;t</h2>
      <p>
        Two things on your station now have times attached to them, and they do
        different jobs.
      </p>
      <p>
        <strong>Show times</strong>, on your settings page, are the claim you
        make to listeners: &ldquo;Thursdays at 8&rdquo;. They&#39;re display
        only. Nothing about them reaches your audio.
      </p>
      <p>
        <strong>Slots</strong>, on the schedule page, are what your station
        actually plays. Listeners never see them.
      </p>
      <p>
        They share a timezone and nothing else. It&#39;s fine to have both
        &mdash; a Thursday 8pm show time telling people when you&#39;re on, and
        a set of slots keeping the station worth tuning into the rest of the
        week.
      </p>
      <p>
        And to be straight about the edges: there are no per-slot jingle rules
        yet (jingle settings are station-wide), no one-off dated shows, and no
        way to make a slot start hard on the minute. Those are on the list
        rather than in the product.
      </p>

      <h2>Who Gets It</h2>
      <p>
        Scheduling is part of AutoDJ, so it comes with Pro &mdash; which is
        free while the beta runs. You ask for it from inside your dashboard and
        we invite stations in a few at a time. Free stations keep everything
        they had: browser broadcasting, push-to-talk, a file queue, a shareable
        player page and a hundred listeners at once.
      </p>
      <p>
        If you&#39;re starting from nothing, the{" "}
        <Link href="/blog/how-to-start-an-internet-radio-station-2026">
          guide to starting a station
        </Link>{" "}
        is the place to begin, and{" "}
        <Link href="/blog/how-much-does-it-cost-to-run-an-internet-radio-station">
          what it costs to run one
        </Link>{" "}
        covers the bills nobody mentions until you have them.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>Can I schedule a news bulletin or a podcast instead of music?</h3>
      <p>
        Yes. A playlist holds audio files, not specifically songs, so recorded
        bulletins, podcast episodes, a syndicated show or a language programme
        all work the same way: put them in their own playlist and give it a
        slot. A station can run music most of the day, break for a
        fifteen-minute bulletin at six, and come back to music without anyone
        touching it.
      </p>

      <h3>Can I play different music at different times of day?</h3>
      <p>
        Yes. Build a playlist for each mood and give it a slot &mdash; the days
        it runs and the hours it covers. Outside every slot your default
        playlist plays, so the station is never left with nothing to do.
      </p>

      <h3>Does the schedule start exactly on time?</h3>
      <p>
        Close to it. A slot takes over at the next track boundary rather than
        cutting a song in half, so it can start a couple of minutes late. For
        something that has to begin on the minute, go live &mdash; that takes
        over instantly.
      </p>

      <h3>What happens if I go live during a scheduled slot?</h3>
      <p>
        You take over immediately, the same as always. When you finish, AutoDJ
        resumes with whichever playlist should be on air at that moment &mdash;
        not necessarily the one that was playing when you started.
      </p>

      <h3>Can a slot run past midnight?</h3>
      <p>
        Yes. Set an end time earlier than the start time and it carries into
        the next day; the editor marks it &ldquo;next day&rdquo;. Tick the day
        it <em>starts</em> on &mdash; a Friday 23:00&ndash;02:00 slot is
        Friday&#39;s.
      </p>

      <h3>Can the same track be in more than one playlist?</h3>
      <p>
        Yes, and it only takes up space once. Your 3&nbsp;GB is counted per
        file, not per playlist entry.
      </p>

      <h3>What plays when nothing is scheduled?</h3>
      <p>
        Your default playlist &mdash; the one with the badge in the library
        rail. Every gap in the week falls back to it, which is why it
        can&#39;t be deleted.
      </p>

      <h3>Is this the same as the show times on my settings page?</h3>
      <p>
        No. Show times are what you advertise to listeners and change nothing
        about your audio. Slots are what your station plays and are never shown
        to listeners. They share a timezone and nothing else.
      </p>
    </>
  )
}
