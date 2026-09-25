import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        The studio is a small radio desk: a microphone, a queue of files, and a
        readout telling you whether any of it is reaching listeners.
      </p>

      <h2>The Microphone</h2>
      <p>
        The meter beside it moves when sound is arriving. Check it before you
        start &mdash; a still meter means the browser gave you the wrong input
        device, which is the single most common reason a first broadcast is
        silent.
      </p>

      <h2>The File Queue</h2>
      <p>
        Drag audio files in from your computer and they play in order. You can
        reorder them by dragging, remove them, and set the queue to repeat the
        whole list or the current track.
      </p>
      <p>
        These files never leave your computer except as the audio going out on
        air &mdash; nothing is uploaded, and nothing here counts against your
        AutoDJ storage. It is a stack of records beside the desk, not a library.
      </p>

      <h2>Push-to-Talk</h2>
      <p>
        Hold it and your microphone comes up while the music drops to a fifth of
        its volume underneath you. Let go and the music comes back. This is how
        you talk over a bed without touching two faders, and it is the control
        worth learning first.
      </p>

      <h2>Monitoring</h2>
      <p>
        The monitor lets you hear the file bus through your own speakers so you
        know what is playing. It deliberately does <em>not</em>{" "}include your
        microphone: routing your own voice back to your speakers is how you
        build a feedback loop, and the studio will not do it for you.
      </p>
      <p>
        If you want to hear yourself, use headphones and your operating
        system&#39;s own monitoring. Never speakers.
      </p>

      <h2>Encoder Health</h2>
      <p>
        The important readout, and the one people ignore. It counts audio that{" "}
        <em>actually left your computer</em>{" "}&mdash; not what the mixer thinks
        it is doing. A level meter will bounce along happily through a dead
        connection; this will not.
      </p>
      <p>
        It shows lost time as a duration, like &ldquo;3.2s lost&rdquo;, because
        that is the number you can act on. A second or two over a long show is
        nothing. Seconds accumulating steadily means your upload is struggling:
        close whatever else is using it, and prefer a cable to wifi for anything
        that matters.
      </p>

      <h2>On a Phone</h2>
      <p>
        There is a version of the studio built for a narrow screen, with the
        same microphone, queue and push-to-talk. The rule from{" "}
        <Link href="/help/go-live-from-your-browser">
          going live from your browser
        </Link>{" "}
        still applies: keep the tab in the foreground.
      </p>
    </>
  )
}
