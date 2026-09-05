import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        The honest answer is that you can run an internet radio station for
        nothing, and most people should start there. The interesting question
        is what happens after that &mdash; because the costs that eventually
        show up are rarely the ones people budget for.
      </p>
      <p>
        Nearly everyone asking this question is worried about the platform fee.
        In practice that&#39;s the smallest line on the bill. The two things
        that actually cost money are music licensing, if you play commercial
        records, and bandwidth, once people are genuinely listening. Here are
        real numbers for both.
      </p>

      <h2>The Short Answer</h2>
      <table>
        <thead>
          <tr>
            <th>If you&#39;re&hellip;</th>
            <th>Monthly cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Starting out, talk or royalty-free music, small audience</td>
            <td>$0</td>
          </tr>
          <tr>
            <td>Running a real station with music playing around the clock</td>
            <td>$5&ndash;30</td>
          </tr>
          <tr>
            <td>Playing commercial music, properly licensed</td>
            <td>$60&ndash;150+</td>
          </tr>
          <tr>
            <td>Self-hosting everything on your own server</td>
            <td>$5&ndash;15, plus your time</td>
          </tr>
        </tbody>
      </table>
      <p>
        The jump from the first row to the third isn&#39;t the software. It&#39;s
        the music.
      </p>

      <h2>What the Platform Costs</h2>
      <p>
        This is the part people compare hardest, and it&#39;s where the least
        money is at stake.
      </p>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Cost</th>
            <th>What you&#39;re paying for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GoCast Free</td>
            <td>$0</td>
            <td>Live broadcasting, 100 listeners, player page</td>
          </tr>
          <tr>
            <td>GoCast Pro</td>
            <td>$15/mo, free during beta</td>
            <td>Music that plays 24/7, 1,000 listeners</td>
          </tr>
          <tr>
            <td>AzuraCast on your own server</td>
            <td>$5&ndash;15/mo</td>
            <td>Everything, if you&#39;re willing to run it yourself</td>
          </tr>
          <tr>
            <td>Radio.co</td>
            <td>$29&ndash;99/mo</td>
            <td>Managed hosting, scheduling, support</td>
          </tr>
          <tr>
            <td>Live365</td>
            <td>$59+/mo</td>
            <td>Hosting with US music licensing bundled in</td>
          </tr>
        </tbody>
      </table>
      <p>
        Two of those prices include something the others don&#39;t. Live365 is
        expensive because the fee covers your US licensing, which you&#39;d
        otherwise arrange and pay for separately &mdash; so comparing it
        directly against a $15 platform is comparing different things. And a
        $5 server is only $5 if your time is worth nothing; budget an evening
        to set it up and an hour here and there forever.
      </p>
      <p>
        If you haven&#39;t broadcast yet, don&#39;t pay anything. Our{" "}
        <Link href="/blog/how-to-start-an-internet-radio-station-2026">
          guide to starting a station
        </Link>{" "}
        goes through the free options in detail. Most stations that fail do so
        in the first month, and a subscription doesn&#39;t change that.
      </p>

      <h2>Music Licensing: The Cost Nobody Warns You About</h2>
      <p>
        This is the big one, and it splits cleanly in three.
      </p>
      <p>
        <strong>Talk content is free.</strong>{" "}
        Podcasts, sermons, sports commentary, interviews, community radio
        without records &mdash; no music licensing applies. If this is you, your
        costs stop at hosting, and this whole section doesn&#39;t affect you.
      </p>
      <p>
        <strong>Royalty-free and Creative Commons music is free.</strong>{" "}
        Free Music Archive, Mixkit, Chosic and ccMixter have large catalogues
        you can broadcast, and plenty of independent artists release under
        licences that allow it with credit. The quality is genuinely good now.
        This is how most small stations avoid the problem entirely.
      </p>
      <p>
        <strong>Commercial music is where the money goes.</strong>{" "}
        Playing chart records means paying the rights bodies &mdash;
        SoundExchange, ASCAP and BMI in the US, and their equivalents
        elsewhere. What you pay depends on your country, your audience size,
        and how many songs you play, so anyone quoting you one flat number is
        guessing. Budget in the tens per month at hobby scale and expect it to
        climb with your listener count, and check your own country&#39;s bodies
        rather than assuming the US rules apply.
      </p>
      <p>
        The practical takeaway: if you want to play commercial music from day
        one, a platform that bundles licensing is often cheaper than assembling
        it yourself, even at $59 a month. If you can build your station on
        royalty-free music or talk, you skip the largest cost in internet radio
        altogether.
      </p>

      <h2>Bandwidth: The Cost That Grows With You</h2>
      <p>
        Every listener is a separate copy of your stream going out over the
        internet. That&#39;s the whole economics of radio hosting in one
        sentence, and it&#39;s why every free tier has a listener cap.
      </p>
      <p>
        At the usual 128 kbps, one listener uses about 58&nbsp;MB an hour. So:
      </p>
      <table>
        <thead>
          <tr>
            <th>Station</th>
            <th>Data per month</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>10 listeners, 2 hours a day</td>
            <td>~35&nbsp;GB</td>
          </tr>
          <tr>
            <td>50 listeners, 4 hours a day</td>
            <td>~350&nbsp;GB</td>
          </tr>
          <tr>
            <td>100 listeners, around the clock</td>
            <td>~4&nbsp;TB</td>
          </tr>
          <tr>
            <td>500 listeners, around the clock</td>
            <td>~20&nbsp;TB</td>
          </tr>
        </tbody>
      </table>
      <p>
        A typical $10 VPS includes one or two terabytes a month. Read the table
        again and you&#39;ll see where self-hosting stops being cheap: it&#39;s
        not the server, it&#39;s the traffic. A station that succeeds is a
        station whose hosting bill grows, on any platform, including ours.
      </p>
      <p>
        You can cut it roughly in half by streaming at 64&ndash;96 kbps instead
        of 128. For talk content that&#39;s an easy trade &mdash; most listeners
        won&#39;t hear the difference on speech. For music, 128 is where most
        stations land.
      </p>

      <h2>Equipment: Less Than You Think</h2>
      <p>
        You need a computer, an internet connection with about 1 Mbps upload,
        and a microphone. Your laptop&#39;s built-in mic is fine for your first
        broadcasts, and a $40 USB condenser mic is enough for a long time after
        that.
      </p>
      <p>
        Mixers, audio interfaces, acoustic foam and broadcast-grade microphones
        are real upgrades, and none of them will get you a single listener. Buy
        equipment when your audience gives you a reason to, not before.
      </p>

      <h2>The Costs People Forget</h2>
      <ul>
        <li>
          <strong>A domain name</strong>{" "}
          &mdash; $10&ndash;15 a year if you want your own address rather than
          a link on someone else&#39;s.
        </li>
        <li>
          <strong>Artwork</strong>{" "}
          &mdash; $0 if you make it yourself, $50&ndash;200 if you commission a
          logo and station art. Worth it later, not first.
        </li>
        <li>
          <strong>Moving platforms</strong>{" "}
          &mdash; costs no money and a lot of goodwill. Every listener has to
          re-tune. Choosing something you can grow into is cheaper than
          choosing the cheapest thing now.
        </li>
        <li>
          <strong>Your time</strong>{" "}
          &mdash; the largest cost in internet radio by a wide margin, and the
          one nobody puts in a spreadsheet. A weekly two-hour show is roughly
          fifteen hours a month once you count planning and promotion.
        </li>
      </ul>

      <h2>What We Charge, and Why</h2>
      <p>
        Since this article is on our own site, here&#39;s our side of it
        plainly.
      </p>
      <p>
        GoCast is free for live broadcasting, with no card and no time limit:
        your microphone, music from your own machine, a page you can share, and
        up to a hundred people listening at once. That covers a lot of
        stations completely.
      </p>
      <p>
        Two things cost us real money, and they&#39;re the two things Pro
        charges for. Listeners cost bandwidth, which is why every plan has a
        ceiling &mdash; ours is 100 on Free and 1,000 on Pro. And a station
        playing around the clock is using a machine around the clock, whether
        or not anyone is tuned in, which is why unattended playout is the paid
        line rather than something we can hand out for free to everyone.
      </p>
      <p>
        Pro is $15 a month, and it&#39;s free while it&#39;s in beta &mdash;
        you request it from your dashboard and we invite stations in a few at a
        time. When billing opens we&#39;ll tell you first.{" "}
        <Link href="/blog/keep-your-radio-station-on-air-24-7">
          What Pro actually does
        </Link>{" "}
        is written up separately.
      </p>

      <h2>Three Realistic Budgets</h2>
      <p>
        <strong>The hobbyist &mdash; $0/month.</strong>{" "}
        Free platform, talk or royalty-free music, laptop mic, a link you share
        yourself. This is where everyone should start, and plenty of stations
        never need to leave.
      </p>
      <p>
        <strong>The committed station &mdash; $15&ndash;30/month.</strong>{" "}
        Paid platform so the station plays when you&#39;re not there, your own
        domain, a decent USB mic. Still no licensing cost, because the music is
        royalty-free or the content is talk.
      </p>
      <p>
        <strong>The commercial-music station &mdash; $60&ndash;150+/month.</strong>{" "}
        Hosting plus proper licensing, which is most of that number. Worth it
        if you have the audience to justify it, and expensive to discover you
        don&#39;t.
      </p>
      <p>
        The trap is starting at the third budget. Start free, find out whether
        you enjoy broadcasting and whether anyone shows up, and let the costs
        arrive when the station has earned them.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>Can I run an internet radio station for free?</h3>
      <p>
        Yes. A free platform, talk content or royalty-free music, and the
        microphone in your laptop will get you a real station with no cost at
        all. The free tier on GoCast has no card and no time limit, and handles
        up to a hundred listeners at once.
      </p>

      <h3>Why do I have to pay for music licensing?</h3>
      <p>
        Because broadcasting a recording to the public is a separate right from
        owning a copy of it. Buying the album, or paying for a streaming
        subscription, doesn&#39;t cover playing it on a station. Royalty-free
        and Creative Commons catalogues exist precisely to avoid this, and
        that&#39;s the route most small stations take.
      </p>

      <h3>How much bandwidth does an internet radio station use?</h3>
      <p>
        About 58&nbsp;MB per listener per hour at 128 kbps. Ten listeners for
        two hours a day is roughly 35&nbsp;GB a month; a hundred listeners
        around the clock is about 4&nbsp;TB. Streaming at 64&ndash;96 kbps
        roughly halves it, which is an easy trade for talk content.
      </p>

      <h3>Is it cheaper to self-host?</h3>
      <p>
        At a small scale, yes on paper &mdash; $5 to $15 a month for a server.
        It stops being cheaper once you count your time setting it up and
        keeping it running, and once your audience pushes you past the traffic
        your server plan includes.
      </p>

      <h3>What does it cost to start, on day one?</h3>
      <p>
        Nothing, and it should be nothing. Sign up somewhere free, broadcast
        for eight weeks, then decide what&#39;s worth paying for. You&#39;ll
        know far more about what you need by then than any article can tell
        you.
      </p>
    </>
  )
}
