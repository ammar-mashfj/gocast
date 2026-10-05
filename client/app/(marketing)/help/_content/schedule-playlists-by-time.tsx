import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        A schedule is a list of slots. A slot is a{" "}
        <Link href="/help/playlists-and-the-rotation">playlist</Link>, a set of
        days, a start time and an end time &mdash; plus an optional name,
        because &ldquo;Drive time&rdquo; is easier to scan than 16:00.
      </p>
      <p>
        It lives under <strong>AutoDJ</strong>{" "}›{" "}<strong>Schedule</strong>{" "}in your dashboard, drawn
        as a week you edit directly: one row per day, midnight to midnight.
      </p>

      <h2>Building One</h2>
      <ol>
        <li>Make the playlists first &mdash; slots point at them.</li>
        <li>
          Click an empty hour to add a one-hour slot, or drag along a day to
          draw a longer one. A dialog opens where you name it and pick its
          playlist, times and days.
        </li>
        <li>
          Drag a slot&rsquo;s left or right edge to make it start or end
          earlier or later.
          Dragging changes that one day only, so weekday mornings can run
          06:00&ndash;12:00 while the weekend runs 08:00&ndash;11:00.
        </li>
        <li>
          Gaps are where nothing is scheduled, and your default playlist fills
          them. Press <strong>Save</strong>{" "}when you&rsquo;re done.
        </li>
      </ol>

      <ZoomableImage
        src="/help/schedule-slots.webp"
        alt="The slot dialog: the name Breakfast, Morning Soul chosen to play, 06:00 to 10:00, and Monday to Friday ticked."
        width={1000}
        height={1398}
      />

      <h2>Slots That Cross Midnight</h2>
      <p>
        Set an end time earlier than the start time and the slot carries into
        the next day. Tick the day it <em>starts</em>{" "}on: a Friday
        23:00&ndash;02:00 slot is Friday&#39;s, even though most of it happens on
        Saturday. It will appear twice in the week view &mdash; at the right
        edge of Friday and the left edge of Saturday &mdash; but you only write
        it once.
      </p>

      <ZoomableImage
        src="/help/schedule-week.webp"
        alt="The week, Monday to Sunday from midnight to midnight: Breakfast every weekday morning, Drive time every weekday afternoon, and After hours starting at the right edge of Friday and carrying on at the left edge of Saturday, where it crosses midnight."
        width={2480}
        height={1252}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>How Precisely a Slot Starts</h2>
      <p>
        That is up to you, slot by slot. Normally a slot takes over at the next
        track boundary rather than cutting a song in half, so a slot written
        for 18:00 may actually begin a couple of minutes after. For most
        stations that is invisible.
      </p>
      <p>
        For a slot that has to start on the minute, switch on{" "}
        <strong>Start exactly on time</strong>{" "}in its dialog. As the start
        time gets close, AutoDJ picks a song from a shuffled playlist that ends
        in time. If none does, it fades out the song that is playing, right on
        the start time. With only a few seconds to go it starts the slot up to
        20 seconds early instead, rather than play a fragment of a song. A
        playlist set to play in order is never reshuffled to fit: its song
        fades out instead.
      </p>
      <p>
        AutoDJ can only plan around songs whose length it has measured, which
        it does a moment after each upload.
      </p>

      <h2>Going Live Over a Slot</h2>
      <p>
        You take over immediately, as always, even over a slot set to start
        exactly on time. When you finish, AutoDJ plays the song it had lined
        up, then carries on with whichever playlist should be on air{" "}
        <em>at that moment</em>{" "}&mdash; not necessarily the one that was
        playing when you started. Come off air at 18:05 and you hand back to
        the news, not to drive time.
      </p>

      <h2>Timezone</h2>
      <p>
        Slots use your station’s timezone, which you set in Station settings,
        under <strong>When you’re usually live</strong>. The Schedule page
        shows it, with a <strong>Change</strong>{" "}link that takes you there. Set it before you build a schedule;
        changing it afterwards moves every slot at once.
      </p>

      <h2>This Is Not Show Times</h2>
      <p>
        Show times live in Station settings, not here. They are advertising
        &mdash; text listeners read on your player page. Slots are what your
        station actually plays, and listeners never see them. You don&#39;t
        need to add your live shows to the schedule: going live takes over from
        any slot, and they appear on the week view anyway, as grey dashed
        marks labelled YOU.
      </p>
      <p>
        There is a{" "}
        <Link href="/blog/how-to-schedule-playlists-on-your-radio-station">
          longer walkthrough on the blog
        </Link>{" "}
        with screenshots of a full week, if you want to see one built out.
      </p>
    </>
  )
}
