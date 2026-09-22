import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        Every station has a public page at{" "}
        <code>gocast.fm/station/your-station</code>. It is the only address
        listeners need, it works on a phone, and nobody needs an account to use
        it. It stays up whether you are on air or not.
      </p>

      <h2>What Is On It</h2>
      <ul>
        <li>
          <strong>The player.</strong>{" "}Press play and you are listening. When
          you are broadcasting it also shows what is on air right now.
        </li>
        <li>
          <strong>Your artwork, name and description.</strong>{" "}The reason to
          fill those in: this is where a stranger decides whether to stay.
        </li>
        <li>
          <strong>Your show times</strong>, if you have set any on your settings
          page &mdash; &ldquo;Mon&ndash;Fri, 7&ndash;9pm&rdquo; and the like.
          These are advertising, not automation: they tell listeners when to
          come back and change nothing about what your station plays.
        </li>
        <li>
          <strong>Share buttons and your own links</strong>{" "}&mdash; whatever
          socials you added in settings.
        </li>
        <li>
          <strong>Other stations on GoCast</strong>, at the foot, so a listener
          who arrives at a quiet station has somewhere to go.
        </li>
      </ul>

      <ZoomableImage
        src="/help/player-page.webp"
        alt="A station player page: large artwork, the station name and description, Follow and Share buttons, social links, and a player bar along the bottom showing what is on air."
        width={3360}
        height={2010}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>When You Are Off Air</h2>
      <p>
        The page shows an <strong>Off air</strong>{" "}badge and, in place of the
        play button, a single field: an email address to be told the next time
        you go live. That is the one useful thing somebody can do at a station
        that is not broadcasting, so it is the only thing offered.
      </p>
      <p>
        This matters more than it looks. Most people who find you will find you
        while you are off air. Without that field they leave and never come
        back; with it, your next broadcast has an audience waiting.
      </p>

      <ZoomableImage
        src="/help/player-now-playing.webp"
        alt="The player bar at the foot of a station page: a play button, a now playing label with the live listener count, and the track title and artist currently on air."
        width={2352}
        height={196}
      />

      <h2>Show Times Are Not the Schedule</h2>
      <p>
        Two different things share a word. Show times, on your settings page,
        are text for listeners. The{" "}
        <Link href="/help/schedule-playlists-by-time">AutoDJ schedule</Link>{" "}is
        what your station actually plays, and listeners never see it. They share
        a timezone and nothing else.
      </p>
    </>
  )
}
