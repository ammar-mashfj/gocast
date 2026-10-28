import { Section, SectionIntro } from "./Section"
import { StudioDemo } from "./StudioDemo"

/*
 * Nothing here may imply the browser session is disposable: a refresh drops
 * the socket and takes the station off air.
 */

/** The studio, to play with: hold the pad, drag the running order. */
export default function StudioSection() {
  return (
    <Section id="studio">
      <SectionIntro
        split
        eyebrow="Inside the studio"
        tag={<span className="rounded-tag bg-foreground px-1.5 py-0.75 eyebrow-sm text-background">Free</span>}
        title="The whole studio, in one tab."
        lead={
          <>
            Queue the music, open the mic, watch the room fill.
            <span className="hidden lg:inline"> Try it — hold the pad or Space, and drag the running order.</span>
          </>
        }
      />
      <StudioDemo />
    </Section>
  )
}
