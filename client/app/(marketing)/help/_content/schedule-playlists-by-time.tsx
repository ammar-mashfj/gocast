import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        A schedule is a list of slots. A slot is a{" "}
        <Link href="/help/playlists-and-the-rotation">playlist</Link>, a set of
        days, a start time and an end time &mdash; plus an optional label,
        because &ldquo;Drive time&rdquo; is easier to scan than 16:00.
      </p>
      <p>
        It lives on your station&rsquo;s <strong>Schedule</strong>{" "}page, drawn
        as a week you edit directly: one row per day, midnight to midnight.
      </p>

      <ZoomableImage
        src="/help/schedule-on-now.webp"
        alt="An On now banner at the top of the schedule page, naming the playlist currently on air, the time it runs until, and which playlist takes over afterwards."
        width={2784}
        height={156}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>Building One</h2>
      <ol>
        <li>Make the playlists first &mdash; slots point at them.</li>
        <li>
          Drag along an empty stretch of a day to draw a slot, then pick its
          playlist, times and days in the panel beside it.
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
        alt="Six scheduled slots: Breakfast and Drive time on weekdays, a News at Six bulletin, a podcast replay on Monday and Wednesday evenings, an After hours slot on Friday and Saturday nights, and Weekend brunch."
        width={2824}
        height={1170}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
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
        alt="The week drawn out from midnight to midnight with a coloured bar for each scheduled playlist, the late-night slot appearing at the right edge of Friday and again at the left edge of Saturday where it crosses midnight."
        width={2808}
        height={660}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>How Precisely a Slot Starts</h2>
      <p>
        Close, but not to the second. A slot takes over at the next track
        boundary rather than cutting a song in half, so a slot written for 18:00
        may actually begin a couple of minutes after. For most stations that is
        invisible. For something that genuinely has to start on the minute, go
        live &mdash; a live broadcast takes over instantly.
      </p>

      <h2>Going Live Over a Slot</h2>
      <p>
        You take over immediately, as always. When you finish, AutoDJ resumes
        with whichever playlist should be on air <em>at that moment</em>{" "}&mdash;
        not necessarily the one that was playing when you started. Come off air
        at 18:05 and you hand back to the news, not to drive time.
      </p>

      <h2>Timezone</h2>
      <p>
        Slots use your station&#39;s timezone, which you set under{" "}
        <strong>Show times</strong>{" "}in Station settings. The Schedule page
        shows it but can&#39;t change it. Set it before you build a schedule;
        changing it afterwards moves every slot at once.
      </p>

      <h2>This Is Not Show Times</h2>
      <p>
        Show times live in Station settings, not here. They are advertising
        &mdash; text listeners read on your player page. Slots are what your
        station actually plays, and listeners never see them. You don&#39;t
        need to add your live shows to the schedule: going live takes over from
        any slot, and they appear on the week view as green marks anyway.
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
