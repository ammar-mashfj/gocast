import { Tag } from "@/components/ds/Tag"
import { Section, SectionIntro } from "./Section"

const STEPS = [
  {
    num: "Step 01",
    time: "15 seconds",
    title: "Create your station",
    body: "Pick a name, choose a genre, and claim your URL. Your player page goes live instantly.",
  },
  {
    num: "Step 02",
    time: "1 click",
    title: "Go on air",
    body: "Hit broadcast and your browser streams you in real time — or upload a library and let AutoDJ run the station for you.",
  },
  {
    num: "Step 03",
    time: "Instant",
    title: "Share your link",
    body: "Send your player page to anyone. They click, they listen. No app download required.",
  },
] as const

export default function HowItWorks() {
  return (
    <Section id="features">
      <SectionIntro
        eyebrow="How it works"
        title="Three steps. Zero complexity."
        lead="Everything happens in your browser. No software to install, no servers to manage."
      />
      {/* Content-height cards, as the comp renders them. Each card is a
          subgrid of the row's three tracks (step row, title, body), so the
          titles sit on one line across all three even when one body wraps
          to an extra line, which the middle one does at most widths. */}
      <ol className="grid gap-3.5 md:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.num}
            className="flex flex-col gap-3 rounded-card bg-card p-6 md:grid md:grid-rows-subgrid md:row-span-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow text-text-faint">{step.num}</span>
              <Tag className="font-mono tracking-[0.04em] text-foreground">{step.time}</Tag>
            </div>
            <h3 className="font-display text-card-title">{step.title}</h3>
            <p className="text-body text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
