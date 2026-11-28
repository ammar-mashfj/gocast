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
          <strong>Share buttons and your own links</strong>{" "}&mdash; whatever
          socials you added in settings.
        </li>
      </ul>

      <ZoomableImage
        src="/help/player-page.webp"
        alt="A station player page: large artwork, the station name and description, Follow and Share buttons, social links, and a player bar along the bottom showing what is on air."
        width={3360}
        height={2010}
       
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

      <h2 id="hide-listener-count">Hiding Your Listener Count</h2>
      <p>
        While you are on air, the player shows how many people are listening
        next to <strong>Now playing</strong>. If you would rather keep that
        number to yourself, you can hide it:
      </p>
      <ol>
        <li>
          Open <strong>Station settings</strong>{" "}in the sidebar.
        </li>
        <li>
          Under <strong>Where listeners find you</strong>, turn off{" "}
          <strong>Show listener count</strong>. It saves straight away.
        </li>
      </ol>
      <p>
        Your player page then says just <strong>Now playing</strong>, and the
        player you embed on your own site stops showing the count too. You
        still see it everywhere in your dashboard: the studio, your Overview
        and the Audience page. Turn the switch back on to show it again.
      </p>
    </>
  )
}
