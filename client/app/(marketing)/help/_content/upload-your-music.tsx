import Link from "next/link"
import { ZoomableImage } from "@/components/content/ZoomableImage"

export default function Body() {
  return (
    <>
      <p>
        AutoDJ plays from a library you upload once. Everything here happens
        under <strong>AutoDJ</strong>{" "}›{" "}<strong>Library</strong>{" "}in your dashboard.
      </p>

      <h2>What You Can Upload</h2>
      <ul>
        <li>
          <strong>Formats:</strong>{" "}MP3, M4A, AAC, FLAC, OGG and WAV.
        </li>
        <li>
          <strong>Up to 300 MB per file.</strong>{" "}Comfortably enough for a
          long DJ mix &mdash; an hour at 320 kbps is about 144 MB.
        </li>
        <li>
          <strong>Up to 30 files at a time.</strong>{" "}Drop more than that and do
          it in batches.
        </li>
        <li>
          <strong>3 GB per station in total</strong>, shared between your music
          and your jingles. That is roughly 30 to 35 hours of audio &mdash;
          about 500 songs.
        </li>
      </ul>
      <p>
        FLAC and WAV are worth a thought before you use them. They sound no
        better once the stream is encoded, and they will eat your 3 GB several
        times faster than MP3 will.
      </p>

      <ZoomableImage
        src="/help/music-library.webp"
        alt="The AutoDJ page: All tracks and two playlists down the left; on the right three tracks with their title, playlists and length, and a note that they have no artist, with a Fix tags button."
        width={2552}
        height={1054}
        className="md:w-[calc(100%+7rem)] md:-ml-14 md:max-w-none"
      />

      <h2>Tags Matter</h2>
      <p>
        Artist and title are read from the file&#39;s own tags, and that is what
        listeners see as the now-playing text on your player page. A library
        full of <code>track04.mp3</code>{" "}becomes a station that cannot say what
        it is playing. Fixing tags before you upload is easiest; for anything
        that slips through, the Library page flags tracks with no artist and
        offers <strong>Fix tags</strong>.
      </p>

      <h2>Where an Upload Lands</h2>
      <p>
        By default it joins your station&#39;s default playlist, so the simple
        case stays simple: upload it, and it plays. If you upload from inside a
        particular playlist, it goes there instead. See{" "}
        <Link href="/help/playlists-and-the-rotation">
          playlists and the rotation
        </Link>
        .
      </p>

      <h2>Jingles</h2>
      <p>
        Station idents, liners and stings are uploaded as jingles rather than
        as music, on the <strong>Jingles</strong>{" "}page under AutoDJ. They
        are not playlist members. Instead they live in jingle lists &mdash;
        Station IDs, Sweepers, Promos, whatever you need &mdash; and each list
        has one rule: which jingle plays (a random one, the next in order, or
        always the same one), how often (every few songs, every so many
        minutes, or at set times of day), and when (all day, or only on some
        days and hours).
      </p>
      <p>
        Jingles play between songs, one per break. A set time can be marked
        exactly on time, and then the song playing at that moment fades out so
        the jingle starts on the dot. Your first jingle upload makes a list
        that plays a random one every 4 songs, so half a dozen idents keep
        your station identifying itself all day without you arranging
        anything. They come out of the same 3 GB.
      </p>

      <h2>A Word on Licensing</h2>
      <p>
        Uploading music you did not make does not license you to broadcast it.
        If you play commercial records, the rights bodies in your country want
        paying, and that is between you and them &mdash; GoCast does not bundle
        licensing. Talk content, your own work, and properly licensed
        royalty-free or Creative Commons music are all free of that problem.
        There is{" "}
        <Link href="/blog/how-much-does-it-cost-to-run-an-internet-radio-station">
          an honest breakdown on the blog
        </Link>
        .
      </p>
    </>
  )
}
