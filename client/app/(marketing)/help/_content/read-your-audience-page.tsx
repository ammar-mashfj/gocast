import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        The <strong>Audience</strong>{" "}page answers a different question from
        your station page. The station page asks whether your station is
        working; this asks whether anybody is there. You can look at the last 7,
        30 or 90 days.
      </p>

      <h2>The Chart Is Listening Time</h2>
      <p>
        One line, and it is deliberately the only one. It plots{" "}
        <strong>listening time per day</strong>{" "}&mdash; the total minutes people
        spent listening &mdash; rather than a headcount.
      </p>
      <p>
        That is the honest measure for radio. Forty people who each stayed for
        an hour is a real audience; four hundred who each bounced after ten
        seconds is not, and a chart of arrivals would rank the second one higher.
        Listening time cannot be gamed by a link that gets clicked a lot.
      </p>
      <p>
        Peak concurrent listeners, arrivals and distinct listeners are in the
        tooltip when you hover a day. They are kept off the chart on purpose:
        they live on completely different scales, and drawing two of them
        together would need a second axis, which makes crossings look like
        events when they mean nothing at all.
      </p>

      <ZoomableImage
        src="/help/audience-chart.webp"
        alt="The audience page: listening time, listeners, peak listeners and average listen across the top, with a bar per day underneath showing listening time over the last thirty days."
        width={2808}
        height={722}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>The Breakdowns</h2>
      <p>
        Countries, devices, browsers and referrers. Referrers is the one to look
        at if you are trying to grow &mdash; it tells you which of the places
        you posted your link actually sent people.
      </p>
      <p>
        <strong>The percentages are shares of what could be identified</strong>,
        not of your whole audience. If a listen could not be placed in a
        country, it is left out of the country list rather than dumped into an
        &ldquo;Unknown&rdquo; bucket &mdash; unknown is often the biggest entry
        and tells you nothing you can act on. So the country shares answer
        &ldquo;of the listeners I can place, where are they&rdquo;.
      </p>

      <ZoomableImage
        src="/help/audience-breakdowns.webp"
        alt="Four breakdown cards — countries with flags, devices, browsers and where listeners came from — each row showing its share, with a footnote naming how many listens could be placed."
        width={2808}
        height={1020}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>What It Does Not Tell You</h2>
      <p>
        Worth knowing so you do not go looking:
      </p>
      <ul>
        <li>
          <strong>It does not split live from AutoDJ.</strong>{" "}The numbers are
          the station&#39;s, not a particular broadcast&#39;s.
        </li>
        <li>
          <strong>A session still in progress is not fully counted</strong>{" "}
          until it ends, so today&#39;s bar is always an underestimate of today.
          Judge today against yesterday tomorrow.
        </li>
        <li>
          <strong>It is not real time.</strong>{" "}The live listener count on your
          station page is the one to watch while broadcasting.
        </li>
      </ul>

      <h2>On the Free Plan</h2>
      <p>
        You see the live listener count on your station page, and that is all
        &mdash; there is no history. Pro keeps 90 days. See{" "}
        <Link href="/help/free-and-pro">what you get on Free and on Pro</Link>.
      </p>
    </>
  )
}
