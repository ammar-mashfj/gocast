import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        You can put a working GoCast player directly on your own website: a
        small box with your artwork, your name, a play button and whatever is
        on air. Visitors listen without leaving your page.
      </p>

      <h2>Getting the Snippet</h2>
      <ol>
        <li>
          Open the share card on your station page, or the stream panel in the
          studio, and choose <strong>Embed</strong>.
        </li>
        <li>
          You get a line of HTML and a live preview of the real player at the
          real size. If it renders in that preview it will render on your site.
        </li>
        <li>
          Paste the snippet into your page wherever you want the player to
          appear.
        </li>
      </ol>

      <h2>Where It Works</h2>
      <p>
        Anywhere you can paste raw HTML: a hand-written page, a WordPress custom
        HTML block, Squarespace or Wix code blocks, Ghost, a static site.
      </p>
      <p>
        Where it will <em>not</em>{" "}work is anywhere that strips HTML from what
        you write &mdash; a Facebook post, most forum posts, the body of an
        email. Those need the plain link instead. See{" "}
        <Link href="/help/share-your-station">share your station</Link>.
      </p>

      <h2>It Follows Your Plan</h2>
      <p>
        The embed needs Pro. If a plan lapses, the snippet on your site stops
        rendering a player &mdash; the page itself is fine, the box just does
        not load. Restore Pro and it comes back with no change on your side,
        because the snippet never changes.
      </p>

      <h2>It Is Live, Not a Copy</h2>
      <p>
        The embedded player is your real station. Change your artwork or your
        name and the embed updates on its own; there is nothing to re-paste.
        And when you are off air it says so, the same as your player page does.
      </p>
    </>
  )
}
