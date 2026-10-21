import { getImageProps } from "next/image"
import { Tag } from "@/components/ds/Tag"
import { Points, Section, SectionIntro } from "./Section"

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
    body: "Your listener count moves in real time next to the deck, with your link one click away to copy. Hand it out without coming off air.",
  },
] as const

const ALT =
  "The GoCast studio during a live show: a large hold-to-talk pad with a mic level meter, the track on air with its countdown, a running order of songs, station IDs and ads, and the live listener count."

/**
 * A real studio, mid-show (Night Shift Radio, a seeded station): the desktop
 * crop from md up, the phone screen below it.
 */
function StudioShot() {
  const common = { alt: ALT, quality: 85 }
  const desktop = getImageProps({ ...common, src: "/home/studio-desktop.webp", width: 2385, height: 1679, sizes: "(min-width: 1280px) 1200px, 100vw" }).props
  const {
    props: { srcSet: phoneSet, ...img },
  } = getImageProps({ ...common, src: "/home/studio-phone.webp", width: 780, height: 1520, sizes: "100vw" })
  // Unoptimized (dev) gives no srcSet: fall back to the file itself, or the
  // desktop <source> is empty and wide screens get the phone picture.
  const phone = phoneSet ?? img.src

  return (
    <figure className="mx-auto w-full max-w-sm md:max-w-none">
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop.srcSet ?? desktop.src} width={2385} height={1679} />
        <source srcSet={phone} />
        <img {...img} alt={ALT} loading="lazy" className="h-auto w-full rounded-card border border-line-strong" />
      </picture>
    </figure>
  )
}

/** The studio mid-broadcast, and three things about it. */
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
      <StudioShot />
      <Points points={POINTS} />
    </Section>
  )
}
