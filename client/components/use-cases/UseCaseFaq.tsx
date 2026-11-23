import { IconPlus } from "@tabler/icons-react"

export type Faq = {
  q: string
  /** The answer as shown on the page (may hold links). */
  a: React.ReactNode
  /** The same answer as plain text, for the FAQPage structured data. */
  text: string
}

/**
 * An audience page's questions. Native <details>, so every answer is in the
 * HTML a crawler reads (and works with no JavaScript), first one open. The
 * shared `name` makes them one accordion: opening a question closes the
 * open one, in the browser itself, no script.
 */
export function UseCaseFaq({ faqs, name = "faq" }: { faqs: Faq[]; name?: string }) {
  return (
    <div className="flex flex-col divide-y divide-line border-y border-line">
      {faqs.map((f, i) => (
        <details key={f.q} name={name} open={i === 0} className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <h3 className="font-display text-heading text-pretty">{f.q}</h3>
            <IconPlus
              aria-hidden
              size={20}
              className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <div className="max-w-3xl pb-6 text-body text-muted-foreground text-pretty [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-3">
            {f.a}
          </div>
        </details>
      ))}
    </div>
  )
}

/** FAQPage JSON-LD for the same questions. */
export function faqJsonLd(faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.text },
    })),
  }
}
