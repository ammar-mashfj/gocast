import { HowItWorksSteps } from "./HowItWorksSteps"
import { Section, SectionIntro } from "./Section"

export default function HowItWorks() {
  return (
    <Section id="features">
      <SectionIntro
        eyebrow="How it works"
        title="Three steps. Zero complexity."
        lead="Everything happens in your browser. No software to install, no servers to manage."
        split
      />
      <HowItWorksSteps />
    </Section>
  )
}
