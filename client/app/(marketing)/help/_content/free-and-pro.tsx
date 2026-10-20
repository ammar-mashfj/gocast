import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        Two plans. Free is free permanently and needs no card. Pro is $20 a
        month.
      </p>

      <h2>The Differences, All of Them</h2>
      {/* Scroll wrapper: the shared prose styles put `overflow-hidden` on
          tables, which CLIPS a table too wide for its column rather than
          letting it scroll. Three columns of plan limits is the widest table
          in the help section, and on a phone the Pro column is the half that
          would be lost. */}
      <div className="overflow-x-auto">
        <table className="min-w-[26rem]">
        <thead>
          <tr>
            <th></th>
            <th>Free</th>
            <th>Pro</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Listeners at once</td>
            <td>100</td>
            <td>1,000</td>
          </tr>
          <tr>
            <td>Broadcast from your browser</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Player page and share links</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>AutoDJ &mdash; music that plays without you</td>
            <td>&mdash;</td>
            <td>3 GB of music</td>
          </tr>
          <tr>
            <td>Playlists and scheduling</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Broadcast from BUTT, Mixxx, RadioDJ</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Embeddable player for your own site</td>
            <td>&mdash;</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Audience history</td>
            <td>Live count only</td>
            <td>90 days</td>
          </tr>
        </tbody>
        </table>
      </div>

      <h2>What That Means in Practice</h2>
      <p>
        The honest summary is that <strong>Free needs you there</strong>. You can
        run a real station, share a real link and have a hundred people listening
        at once &mdash; talking, playing files from the queue, or both. What you
        cannot do is walk away: the station plays while your browser is open and
        goes quiet when you close it, because the thing that would keep it going
        without you is AutoDJ.
      </p>
      <p>
        <strong>Pro is the station that keeps going.</strong>{" "}Upload music, give
        it a schedule, and there is something on air at four in the morning
        whether or not you are awake, with you cutting in live whenever you
        want.
      </p>

      <h2>The Listener Cap</h2>
      <p>
        It counts people listening <em>at the same time</em>, not people per
        day or per month. A hundred concurrent listeners is a genuinely busy
        small station. Nothing is metered by the hour and there is no bandwidth
        bill waiting for you.
      </p>

      <h2>Getting Pro</h2>
      <p>
        Buy it from your dashboard &mdash; the locked features each have a
        button. Pick a term, pay, and Pro switches on as soon as the payment
        is confirmed. It is paid in advance for the term you pick and does
        not renew on its own. Cancel any time and we refund what you paid,
        minus the months you have used at the monthly price &mdash; never
        less than nothing, so you never owe more than you paid.
      </p>

      <h2>If a Plan Lapses</h2>
      <p>
        Nothing is deleted. Your uploads, playlists and schedule stay exactly as
        they are, and the features that need Pro stop working until it comes
        back. Your{" "}
        <Link href="/help/your-player-page">player page</Link>{" "}and your link
        keep working throughout.
      </p>
    </>
  )
}
