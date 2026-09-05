import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        From the listener&#39;s side, internet radio looks like magic: press
        play anywhere on earth and a station is just <em>there</em>, mid-song,
        as if it had been waiting for you. From the broadcaster&#39;s side
        it&#39;s a machine with four moving parts, and the fastest way to
        understand the machine is to build it the worst possible way first
        &mdash; with a laptop in the corner of a room that&#39;s not allowed to
        sleep &mdash; and watch where it breaks.
      </p>
      <p>
        That&#39;s what this article does. By the end you&#39;ll know what
        every radio platform is actually doing under the hood, why the
        laptop-in-the-corner version fails, and what we built GoCast to do
        about each failure in turn.
      </p>

      <h2>The Whole Machine in One Sentence</h2>
      <p>
        A radio station is one continuous audio signal, compressed into a
        stream, copied once for every listener. Everything else is detail.
        Four jobs make it happen:
      </p>
      <ul>
        <li>
          <strong>The source</strong> &mdash; something has to produce audio
          every second of the day. Your voice, a playlist, or both taking
          turns.
        </li>
        <li>
          <strong>The encoder</strong> &mdash; something has to compress that
          audio into a stream small enough to send over the internet.
        </li>
        <li>
          <strong>The server</strong> &mdash; something has to take that one
          stream and hand a separate copy to every listener who connects.
        </li>
        <li>
          <strong>The link</strong> &mdash; a URL that always points at the
          station, so listeners can find it, share it, and come back to it.
        </li>
      </ul>
      <p>
        Radio&#39;s defining constraint lives in the third job: every listener
        is a full copy of the stream. Ten listeners is ten copies going out,
        a hundred is a hundred. Hold onto that &mdash; it explains almost
        every price and every limit in internet radio.
      </p>

      <h2>Building It the Hard Way: The 24-Hour Laptop</h2>
      <p>
        Here&#39;s the version people actually attempt, because every piece of
        it is free. A laptop runs a media player with a long playlist &mdash;
        that&#39;s the source. An encoder app like BUTT sits next to it,
        grabbing the audio and compressing it. The stream goes to server
        software like Icecast &mdash; sometimes rented, sometimes, heroically,
        running on the same laptop with the home router forwarding a port to
        the world. The link is your home IP address with a port number on the
        end.
      </p>
      <p>
        And it works. For a while, this genuinely works, and there&#39;s
        something to be said for doing it once just to see the machine run.
        Then reality arrives, in roughly this order.
      </p>

      <h3>The Laptop Is Not Allowed to Stop</h3>
      <p>
        The source has to produce audio every second, which means the laptop
        can never sleep, never update, never reboot, and never be needed for
        anything else. An operating system update at 3am is six hours of dead
        air you find out about at breakfast. A power cut is a silent station
        until you get home. The machine becomes an appliance you live around,
        and the first thing every long-running station learns is that
        consumer computers are not appliances.
      </p>

      <h3>Your Upload Bandwidth Runs Out Almost Immediately</h3>
      <p>
        Remember: one copy per listener. A stream at 128 kbps needs 128 kbps
        of upload <em>per listener, continuously</em>. Ten listeners is about
        1.3 Mbps sustained; a hundred is 13 Mbps, around the clock, on a home
        connection where upload is the thin direction. Somewhere between ten
        and thirty listeners, home internet simply runs out &mdash; and it
        runs out at the worst moment, which is the moment people actually
        show up.
      </p>

      <h3>The Link Keeps Breaking</h3>
      <p>
        Home connections get a new IP address whenever the ISP feels like it.
        The address you posted everywhere on Monday points at nothing on
        Thursday, and every listener who saved it is gone. Radio audiences are
        built on habit &mdash; a link that moves is a station that keeps
        starting over.
      </p>

      <h3>Nobody Tells You It&#39;s Gone Quiet</h3>
      <p>
        The encoder crashes, the playlist hits a corrupt file, the player
        stops &mdash; and the stream carries on, faithfully broadcasting
        silence. Everything looks fine from where you&#39;re sitting, because
        you aren&#39;t sitting there; you&#39;re asleep. Silence is the
        failure mode nothing warns you about, and it costs you listeners who
        never explain why they left.
      </p>

      <h3>Going Live Means a Gap</h3>
      <p>
        The playlist is one program feeding the encoder; your microphone is
        another. Switching between them means stopping one and starting the
        other, and in the gap, listeners get disconnected. Anyone who&#39;s
        tried to start their weekly show by frantically clicking between two
        apps while the stream drops knows this moment. The joins are where
        home-built stations sound home-built.
      </p>

      <h3>Every File Is a Different Volume</h3>
      <p>
        A quiet album rip from 2004 next to a loud modern master means your
        listeners ride the volume knob all night. Add the files with three
        seconds of nothing at the front, and the rotation develops little
        holes of dead air that sound like something&#39;s broken. Individually
        tiny, collectively the difference between sounding like a station and
        sounding like a folder of MP3s.
      </p>

      <h2>The Usual Fix: Move It All to a Server</h2>
      <p>
        Every one of those problems has the same root: the machine doing the
        broadcasting lives in your house. So the traditional fix is to move
        the whole stack onto a rented server &mdash; a machine in a data
        centre that never sleeps, with fat upload bandwidth and an address
        that doesn&#39;t change.
      </p>
      <p>
        This is genuinely how it&#39;s done. A playout engine such as
        Liquidsoap plays the music library and handles the switch to live; a
        streaming server such as Icecast takes the encoded stream and serves
        the copies; a package like AzuraCast wraps the two in a web
        interface. It solves the laptop, the bandwidth, and the link in one
        move.
      </p>
      <p>
        What it doesn&#39;t solve is who runs it &mdash; because now that&#39;s
        you. Installing it, upgrading it, reading logs when the stream dies at
        midnight, noticing when the disk fills up. Self-hosting turns a
        broadcasting hobby into a system administration hobby, which is a
        fine hobby if it&#39;s the one you wanted. We&#39;ve put real numbers
        on that trade in{" "}
        <Link href="/blog/how-much-does-it-cost-to-run-an-internet-radio-station">
          what it actually costs to run a station
        </Link>{" "}
        &mdash; the short version is that the $5 server is only $5 if your
        evenings are worth nothing.
      </p>

      <h2>The Same Machine, the Way GoCast Runs It</h2>
      <p>
        GoCast is that server-side stack, run for you, with the four jobs
        assigned like this.
      </p>
      <p>
        <strong>The source lives on our machines, not yours.</strong>{" "}
        On Pro, you upload your music &mdash; 3&nbsp;GB per station, roughly
        30 to 35 hours &mdash; and AutoDJ plays it around the clock, with
        your jingles and station IDs dropped in on whatever schedule you set.
        Your laptop&#39;s only job left is being the microphone, and only
        while you&#39;re actually live. Close it, and the station carries on.
      </p>
      <p>
        <strong>The gap when you go live is gone.</strong>{" "}
        Your live input and the AutoDJ feed the same pipeline, so going live
        cuts in instantly and finishing hands straight back to the music
        &mdash; listeners stay connected through both switches. The same
        mechanism covers you when your internet drops mid-show: the audience
        hears the station carry on rather than silence, and you rejoin when
        you&#39;re back.
      </p>
      <p>
        <strong>Encoding is handled wherever you broadcast from.</strong>{" "}
        In the browser, it&#39;s done for you &mdash; open the studio, allow
        the microphone, you&#39;re on. On Pro, your station also accepts the
        standard encoder connection that apps like BUTT and Mixxx speak, so a
        desktop setup plugs into the same station.
      </p>
      <p>
        <strong>The copies come off our bandwidth.</strong>{" "}
        The one-copy-per-listener economics don&#39;t disappear &mdash; they
        move to us, which is exactly why plans have listener ceilings: 100 at
        once on Free, 1,000 on Pro. That&#39;s the honest shape of the cost,
        not an arbitrary paywall.
      </p>
      <p>
        <strong>The link is permanent.</strong>{" "}
        Your station&#39;s player page shows what&#39;s playing and how many
        are tuned in, and the address never changes &mdash; not when your
        home IP does, not between shows, not while the station&#39;s off.
        Anyone who lands on it while you&#39;re quiet can ask to be emailed
        the next time you go live, so the dead hours still recruit.
      </p>
      <p>
        And the two failures nobody warns you about are watched for.
        Uploads are checked for loudness and for dead air at the ends, and
        both are corrected on playback, so the 2004 rip and the modern master
        sit at the same level. A station that&#39;s on air producing genuine
        silence &mdash; nobody live, nothing queued &mdash; switches itself
        off within a couple of minutes instead of broadcasting nothing all
        night.
      </p>

      <h2>Why This Is Worth Knowing</h2>
      <p>
        You don&#39;t need any of this to run a station on GoCast &mdash;
        that&#39;s rather the point. But knowing how the machine works makes
        the whole market legible: why every platform has listener caps, what a
        $59 plan is actually buying over a $15 one, why self-hosting is
        cheaper on paper and dearer in evenings, and what&#39;s really
        happening in the two seconds between pressing &ldquo;go live&rdquo;
        and hearing your own voice on the player page.
      </p>
      <p>
        If this has you wanting to build the station rather than the server,
        start with our{" "}
        <Link href="/blog/how-to-start-an-internet-radio-station-2026">
          guide to starting an internet radio station
        </Link>
        , and see{" "}
        <Link href="/blog/keep-your-radio-station-on-air-24-7">
          how stations stay on air 24/7
        </Link>{" "}
        for what the always-on half looks like in practice. The free plan
        needs no card and no server &mdash; a name, a microphone, and
        you&#39;re the source.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>Does my computer have to stay on for my station to play?</h3>
      <p>
        Only in the laptop-in-the-corner version. On GoCast the source runs
        on our servers: on Pro your uploaded music plays around the clock
        whether your computer is on or not, and on the free plan your
        computer only matters while you&#39;re actually live.
      </p>

      <h3>What are Icecast, Shoutcast and Liquidsoap?</h3>
      <p>
        The traditional building blocks of the server side. Icecast and
        Shoutcast are streaming servers &mdash; they take one encoded stream
        and serve a copy to each listener. Liquidsoap is a playout engine
        &mdash; it plays the library, and switches between music and live.
        Hosted platforms run this class of software for you so you never
        touch it.
      </p>

      <h3>How do listeners actually receive the stream?</h3>
      <p>
        Each listener&#39;s player opens a connection to the station&#39;s
        URL and receives their own continuous copy of the audio. That&#39;s
        why radio bandwidth scales with audience: a hundred listeners is a
        hundred simultaneous copies, roughly 13 Mbps at 128 kbps.
      </p>

      <h3>Why does every radio platform have a listener limit?</h3>
      <p>
        Because every listener is a full copy of the stream coming off the
        platform&#39;s bandwidth, all hour, every hour. The caps are the
        cost structure made visible &mdash; on GoCast that&#39;s 100
        listeners at once on Free and 1,000 on Pro.
      </p>

      <h3>Can I still self-host a station instead?</h3>
      <p>
        Yes &mdash; a VPS running AzuraCast is the standard route, at $5 to
        $15 a month plus your time, and it&#39;s a real education in how the
        machine works. It stops being cheap once you count the evenings, and
        once your audience outgrows the traffic included with the server.
      </p>
    </>
  )
}
