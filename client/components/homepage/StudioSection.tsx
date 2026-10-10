import { Tag } from "@/components/ds/Tag"
import { Points, Section, SectionIntro } from "./Section"
import { StudioDeck } from "./StudioDeck"

/*
 * One capability each, not one detail each. Each point names a whole piece
 * of the desk — the running order, the mixer, the room — because what a
 * visitor is actually unsure about is whether a browser tab can hold a real
 * studio. Nothing here may imply the browser session is disposable: a
 * refresh drops the socket and takes the station off air.
 */
const POINTS = [
  {
    title: "A running order, not a file picker",
    body: "Drag tracks in, reorder them while they play, repeat one or all. The deck counts down what’s left of the track on air, so you know when to talk.",
  },
  {
    title: "A mic that behaves like a mixer",
    body: "Hold Space and the bed ducks under your voice, then lifts when you let go. Monitor through headphones while you do it — the mic is never on unless you put it there.",
  },
  {
    title: "The room, while you’re in it",
    body: "Your listener count moves in real time next to the deck, with the link and a QR code beside it. Hand it out without coming off air.",
  },
] as const

/**
 * The deck mid-broadcast, and three things about it. The mock is a working
 * one: a visitor can press play, hold the pad and reorder the queue, which
 * is the only way to show that a tab can hold a studio rather than claim it.
 */
export default function StudioSection() {
  return (
    <Section id="studio" tone="card">
      <SectionIntro
        split
        eyebrow="Inside the studio"
        tag={<Tag className="font-mono uppercase tracking-widest text-foreground">Free</Tag>}
        title="The whole studio, in one tab."
        lead="Queue the music, open the mic, watch the room fill. A running order you can rearrange mid-show, a bed that ducks under your voice, sound monitoring and live listener numbers — with nothing to install."
      />
      <StudioDeck />
      <Points points={POINTS} />
    </Section>
  )
}
