export default function Body() {
  return (
    <>
      <p>
        Every guide we found when researching internet radio was either a thinly-veiled
        sales pitch or written in 2018 with broken links to software that no longer exists.
        So we did the legwork: tested every major platform, dealt with the licensing
        confusion firsthand, and wrote down what we wish someone had told us at the start.
      </p>
      <p>
        This covers the real decisions you&#39;ll face &mdash; what software to use, what
        gear actually matters, music licensing explained without the hand-waving, and honest
        numbers on growing an audience. Skip to whatever section you need.
      </p>

      <h2>What Kind of Station Are You Building?</h2>
      <p>
        The right tool depends entirely on what you want to broadcast. Most guides skip
        this and jump straight to software, which is like recommending a car before asking
        if you need to haul lumber or commute downtown.
      </p>
      <ul>
        <li>
          <strong>Talk shows, sermons, sports commentary, or live podcasting</strong> &mdash;
          You need a mic and a platform that lets you go live fast. No mixing board, no
          playlist automation. Browser-based tools handle this in about a minute.
        </li>
        <li>
          <strong>Music station that plays when you&#39;re offline</strong> &mdash;
          You need AutoDJ &mdash; software that keeps tracks playing 24/7 without a human
          at the controls. AzuraCast or Radio.co are the main options.
        </li>
        <li>
          <strong>Multi-DJ station with scheduled shows</strong> &mdash;
          You need user accounts, a programming schedule, and listener analytics.
          Managed-platform territory: Radio.co, Live365, or a well-configured AzuraCast.
        </li>
        <li>
          <strong>Just experimenting</strong> &mdash;
          Start free. Don&#39;t spend money on a hobby you might drop in three weeks.
        </li>
      </ul>

      <h2>How Internet Radio Actually Works</h2>
      <p>
        Before picking software, it helps to understand the basic mechanic. Internet radio
        isn&#39;t complicated, but knowing the pieces makes every other decision in this
        guide make more sense.
      </p>
      <p>
        Your audio source (microphone, music files, DJ software) feeds into
        an <strong>encoder</strong>&nbsp;that compresses the audio in real time &mdash; usually
        to MP3 or AAC at 128&ndash;320 kbps. The encoder sends that compressed stream to
        a <strong>relay server</strong> (Icecast and Shoutcast are the two main ones).
        The relay server accepts incoming listener connections and fans the single stream
        out to everyone tuned in. Listeners hear it through a player page, a mobile app,
        or any media player that supports stream URLs.
      </p>
      <p>
        With browser-based platforms like <a href="https://gocast.fm">GoCast</a>, the
        browser itself acts as the encoder &mdash; it captures your mic or file audio, encodes
        it, and sends it to the relay. That&#39;s why no software download is needed. With
        desktop setups like BUTT + Icecast, you manage the encoder and relay separately.
      </p>
      <p>
        The key numbers: a single 128 kbps stream uses about 1 Mbps of upload bandwidth. Each
        concurrent listener costs the relay server roughly 128 kbps of outbound bandwidth.
        A station with 100 listeners at 128 kbps needs about 12.8 Mbps of server bandwidth
        &mdash; which is why hosting costs scale with audience size, and why free tiers cap
        listener counts.
      </p>

      <h2>Internet Radio Software Compared (2026)</h2>
      <p>
        We&#39;ve tested all of these. Here&#39;s what each is actually like to use, not
        what their landing page says.
      </p>

      <h3>Browser-Based Platforms (Easiest Start)</h3>
      <p>
        Sign up, click broadcast, you&#39;re live. No downloads, no server configuration,
        no audio routing to debug.
      </p>
      <p>
        <a href="https://gocast.fm"><strong>GoCast</strong></a> &mdash; Full disclosure:
        this is our platform. The free tier includes one station, 25 concurrent listeners,
        file queue playback, push-to-talk with auto-ducking, and a public player page. The
        browser handles audio encoding, which keeps server costs low enough to offer a
        real free tier.
      </p>
      <p>
        Strongest point: going from zero to live in under a minute. Weakest point: no
        server-side AutoDJ yet (planned for June - July 2026), so your station goes quiet when you close the browser tab.
      </p>

      <h3>Self-Hosted Platforms (Most Control)</h3>
      <p>
        Install the software on a VPS you control. Maximum power, zero recurring platform
        fees beyond the $5&ndash;15/month server.
      </p>
      <p>
        <a href="https://www.azuracast.com/"><strong>AzuraCast</strong></a> dominates this
        category. It bundles a web-based DJ panel, AutoDJ with crossfading, scheduled shows,
        listener requests, podcast publishing, and analytics. The Docker-based install has
        gotten much smoother over the years.
      </p>
      <p>
        The catch: you need comfort with SSH, Docker, DNS records, and SSL certificates.
        If &ldquo;spin up a VPS&rdquo; sounds foreign, this isn&#39;t your starting point.
        Setup takes 1&ndash;3 hours for someone with server experience, potentially a full
        afternoon without it.
      </p>

      <h3>Managed Paid Platforms (Least Maintenance)</h3>
      <p>
        Somebody else runs the infrastructure. You pay monthly and focus on content.
      </p>
      <p>
        <a href="https://radio.co/"><strong>Radio.co</strong></a> starts at $29/month.
        Polished interface, scheduled programming, analytics, embeddable players, and
        responsive support. The safe professional choice.
      </p>
      <p>
        <a href="https://live365.com/"><strong>Live365</strong></a> starts around $59/month.
        The main draw is royalty-included streaming &mdash; they handle music licensing fees
        in the US and some other regions. If you want to play mainstream music legally
        without dealing with SoundExchange yourself, this is the simplest path.
      </p>
      <p>
        <a href="https://www.radioking.com/"><strong>RadioKing</strong></a> is the European
        alternative with similar features and competitive pricing.
      </p>

      <h3>Desktop Software (Most Powerful, Most Setup)</h3>
      <p>
        <strong>BUTT (Broadcast Using This Tool)</strong> is free, open-source, and does
        exactly one thing: captures audio from your computer and sends it to an Icecast or
        Shoutcast server. Pair it with <strong>Mixxx</strong> (free DJ software with
        crossfading, EQ, and beatmatching) and you get a legitimately powerful broadcasting
        rig.
      </p>
      <p>
        The tradeoff is complexity. You&#39;re managing audio routing between applications,
        configuring a streaming server separately, and troubleshooting three pieces of
        software when something breaks.
      </p>

      <h2>Quick Comparison Table</h2>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Setup time</th>
            <th>Cost</th>
            <th>Browser broadcasting</th>
            <th>AutoDJ</th>
            <th>Best for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>GoCast</strong></td>
            <td>60 seconds</td>
            <td>Free</td>
            <td>Yes</td>
            <td>Coming soon</td>
            <td>Hobbyists, podcasters, churches</td>
          </tr>
          <tr>
            <td>AzuraCast</td>
            <td>1&ndash;3 hours</td>
            <td>$5&ndash;15/mo VPS</td>
            <td>Yes (Web DJ)</td>
            <td>Yes</td>
            <td>Technical users</td>
          </tr>
          <tr>
            <td>Radio.co</td>
            <td>30 minutes</td>
            <td>$29&ndash;99/mo</td>
            <td>No</td>
            <td>Yes</td>
            <td>Professional stations</td>
          </tr>
          <tr>
            <td>Live365</td>
            <td>30 minutes</td>
            <td>$59+/mo</td>
            <td>No</td>
            <td>Yes</td>
            <td>Stations needing licensing</td>
          </tr>
          <tr>
            <td>BUTT + Icecast</td>
            <td>2&ndash;4 hours</td>
            <td>Server cost</td>
            <td>No</td>
            <td>No</td>
            <td>DJs with technical comfort</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Not sure where to start?</strong> If you&#39;re reading this article, GoCast
        or AzuraCast are probably your two best starting points &mdash; free/cheap, capable,
        and you can migrate to a managed platform later if you outgrow them.
      </p>

      <h2>Broadcasting Equipment: What You Actually Need</h2>
      <p>
        Every &ldquo;how to start a radio station&rdquo; video on YouTube features a
        $400 microphone, an audio interface, a mixer, and acoustic foam. That&#39;s a great
        setup for someone with an audience. It&#39;s a terrible shopping list for someone
        who hasn&#39;t broadcast once.
      </p>
      <p><strong>To start broadcasting today:</strong></p>
      <ul>
        <li>A computer (or phone, in a pinch)</li>
        <li>Internet with at least 1 Mbps upload (enough for a 128 kbps stream)</li>
        <li>Any microphone &mdash; your laptop&#39;s built-in mic is fine for your first few broadcasts</li>
      </ul>
      <p>
        That&#39;s it. We ran test broadcasts for months on a $40 USB condenser mic and
        the audio quality held up fine.
      </p>
      <p><strong>When you&#39;re ready to upgrade (not before):</strong></p>
      <ul>
        <li>
          USB condenser mic, $60&ndash;150 range &mdash; Audio-Technica AT2020 USB+ and
          Blue Yeti are both solid picks with plenty of setup guides online
        </li>
        <li>Pop filter ($10&ndash;15) &mdash; kills plosive sounds on hard P and B</li>
        <li>Closed-back headphones ($30&ndash;100) &mdash; monitor your stream without feedback loops</li>
      </ul>
      <p><strong>Don&#39;t buy yet:</strong></p>
      <ul>
        <li>Mixers or audio interfaces &mdash; only useful with multiple mics or instruments</li>
        <li>XLR microphones &mdash; require an audio interface you probably don&#39;t need</li>
        <li>Broadcast-grade mics from Shure or Electro-Voice &mdash; overkill until your audience notices the difference</li>
      </ul>
      <p>
        Buy equipment when listeners ask you to, not before you have listeners.
      </p>

      <h2>A Quick Note on Music Licensing</h2>
      <p>
        If you&#39;re broadcasting talk content &mdash; podcasts, sermons, sports
        commentary, interviews &mdash; licensing doesn&#39;t apply to you at all. Skip
        ahead.
      </p>
      <p>
        If you want to play music, the simplest route is <strong>royalty-free
        music</strong>. The quality has gotten genuinely good. Sites like{" "}
        <a href="https://freemusicarchive.org/">Free Music Archive</a>,{" "}
        <a href="https://mixkit.co/free-stock-music/">Mixkit</a>,{" "}
        <a href="https://www.chosic.com/free-music/">Chosic</a>, and{" "}
        <a href="https://dig.ccmixter.org/free">ccMixter</a> have large catalogs of
        tracks you can broadcast freely. Many independent artists also release music
        under Creative Commons licenses that allow broadcasting with credit.
      </p>
      <p>
        If you want to play mainstream/commercial music, that requires proper licensing
        (SoundExchange, ASCAP, BMI, etc. in the US &mdash; other countries have
        equivalents). Platforms like{" "}
        <a href="https://live365.com/">Live365</a> bundle licensing into their monthly
        fee, which simplifies the process considerably. But for getting started, royalty-free
        music keeps things simple and lets you focus on building your station and audience
        first.
      </p>

      <h2>How to Get Your First Listeners (Realistic Numbers)</h2>
      <p>
        Broadcasting is the easy part. Discovery is the real challenge, and the numbers
        are worth being honest about.
      </p>
      <p><strong>Typical growth for a new internet radio station:</strong></p>
      <ul>
        <li>Week 1: 3&ndash;10 listeners, mostly people you personally told</li>
        <li>Month 1: 10&ndash;30 regulars if you broadcast on a consistent schedule</li>
        <li>Month 6: 50&ndash;200 regulars with active promotion and a clear niche</li>
        <li>Year 1: 200&ndash;1,000 regulars if your content is something people seek out</li>
      </ul>
      <p>
        These numbers look small next to podcasts or YouTube channels, but internet radio
        listeners behave differently &mdash; they tune in repeatedly, often for hours. Ten
        dedicated weekly listeners is a real audience. Don&#39;t measure yourself against
        FM stations with decades of brand recognition and government-allocated spectrum.
      </p>

      <h3>What Actually Grows an Audience</h3>
      <p>
        <strong>Consistency beats everything.</strong> A station that goes live at 7 PM
        every Thursday builds more audience than one that broadcasts randomly four times a
        month. Commit to a schedule for at least eight weeks before evaluating. Most people
        quit before their audience has time to form a habit.
      </p>
      <p>
        <strong>Specificity attracts dedication.</strong> &ldquo;Indie jazz from the
        Pacific Northwest&rdquo; will attract more loyal listeners than &ldquo;music I
        like.&rdquo; The narrower the niche, the more likely someone searching for exactly
        that will find you and stay.
      </p>
      <p>
        <strong>Make it dead simple to tune in.</strong> Put your station link in your
        social bios, email signature, and forum profiles. If someone has to search for
        your station, most won&#39;t bother.
      </p>
      <p>
        <strong>Cross-promote with other small stations.</strong> DJs trade shoutouts.
        Stations share each other&#39;s links. A listener who enjoys one small station is
        likely to enjoy another &mdash; internet radio has always grown collaboratively.
      </p>
      <p>
        <strong>Show up where your listeners already are.</strong> Genre-specific
        subreddits, Discord servers, Facebook groups. Contribute genuinely and mention your
        station when relevant &mdash; not as spam, but as part of the community.
      </p>
      <p>
        <strong>Stream live events.</strong> A local concert, a church service, a sports
        game &mdash; offering a live stream to people who can&#39;t attend is one of the
        fastest ways to convert first-time listeners into regulars.
      </p>

      <h3>What Doesn&#39;t Work as Well as People Claim</h3>
      <ul>
        <li>
          <strong>Directory submissions</strong> (TuneIn, Radio Garden) &mdash; slow
          approval, low conversion. Worth doing eventually, not a growth strategy.
        </li>
        <li>
          <strong>Paid ads</strong> &mdash; cost per acquired listener is brutal for a
          hobby station.
        </li>
        <li>
          <strong>&ldquo;Going viral&rdquo;</strong> &mdash; not a strategy. If it
          happens, great. Don&#39;t plan around it.
        </li>
      </ul>

      <h2>The Simplest Path from Zero to Live</h2>
      <p>
        If we were starting a station today with no experience:
      </p>
      <ol>
        <li>
          Pick a tool from the comparison table above. Not sure? Start with something free
          and browser-based &mdash; you can always migrate later.
        </li>
        <li>Create a station with a memorable name and a genre specific enough to search for.</li>
        <li>Use royalty-free music or talk content for the first broadcasts. Remove the licensing question entirely while you&#39;re learning.</li>
        <li>Commit to a schedule. One hour a week is enough &mdash; consistency matters more than duration.</li>
        <li>Personally tell ten people. Not a social media post &mdash; a direct message to ten specific humans.</li>
        <li>Broadcast for eight weeks before evaluating whether it&#39;s &ldquo;working.&rdquo;</li>
        <li>Adjust based on what you learn. Eight broadcasts will teach you more than ten more articles.</li>
      </ol>
      <p>
        The hardest part of internet radio isn&#39;t the technology &mdash; it hasn&#39;t
        been for years. The hardest part is showing up consistently while your audience is
        still small. Every station worth listening to went through that same phase. The ones
        that made it are the ones that kept broadcasting anyway.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>Can I broadcast from my phone?</h3>
      <p>
        Yes, with browser-based platforms like{" "}
        <a href="https://gocast.fm">GoCast</a>. Mobile broadcasting works for shorter
        sessions, but mobile browsers throttle background tabs aggressively &mdash; keep
        the tab in the foreground for reliable streams. For anything longer than an hour,
        use a laptop or desktop.
      </p>

      <h3>What&#39;s the difference between internet radio and a podcast?</h3>
      <p>
        A podcast is pre-recorded episodes published to a feed (Spotify, Apple Podcasts)
        that listeners consume on their own schedule. Internet radio is a live or scheduled
        audio stream that listeners tune into in real time. Some platforms blur the line
        &mdash; you can record a live broadcast and publish it as a podcast episode later
        &mdash; but the core experience is different. Radio is appointment listening.
      </p>

      <h3>How many listeners can a small station realistically get?</h3>
      <p>
        Most small internet radio stations settle between 10&ndash;100 regular listeners.
        Top independent stations reach 1,000&ndash;10,000. The ceiling depends almost
        entirely on niche specificity and broadcast consistency, not equipment or
        platform choice.
      </p>
    </>
  )
}
