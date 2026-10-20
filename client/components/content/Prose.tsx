import { cn } from "@/lib/utils"

/**
 * Long-form body copy on the dark marketing shell — blog articles and help
 * articles both.
 *
 * Extracted from the blog article page, where this class list lived inline.
 * Two bodies rendered by two routes with two copies of thirty Tailwind
 * modifiers is a guarantee that a link colour gets fixed in one of them and
 * not the other, and the help section is the second reader of exactly the same
 * prose. Nothing here is blog-specific.
 *
 * Tables scroll sideways below md (`display:block` on the table itself, the
 * usual trick when the markup can't be wrapped): the comparison tables in
 * the blog are wider than a phone, and the alternative was the whole page
 * scrolling sideways.
 *
 * `prose-img` is styled even though article images normally go through
 * ZoomableImage, which brings its own frame: a bare `<img>` in a body would
 * otherwise render unstyled, and the failure looks like a bug rather than a
 * missing wrapper.
 *
 * Renders an `<article>` rather than a div because both callers are one: a
 * self-contained body that would still make sense syndicated away from the
 * page furniture around it. That is what the blog route used before this was
 * extracted, and dropping to a div in the move would have been a silent
 * downgrade for every screen reader.
 */
export function Prose({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        `
        prose prose-invert max-w-[68ch]
        prose-headings:text-foreground prose-headings:font-display prose-headings:font-extrabold prose-headings:tracking-[-0.03em] prose-headings:text-balance
        prose-h2:text-title-lg prose-h2:mt-14 prose-h2:mb-5
        prose-h3:text-title-sm prose-h3:mt-10 prose-h3:mb-4
        prose-p:text-[17px] prose-p:text-text-secondary prose-p:leading-[1.7] prose-p:text-pretty
        prose-li:text-[17px] prose-li:text-text-secondary prose-li:leading-[1.7]
        prose-strong:text-foreground
        prose-a:text-on-air-text prose-a:underline prose-a:underline-offset-4 prose-a:decoration-on-air/40 hover:prose-a:decoration-on-air
        prose-code:text-on-air-text prose-code:bg-surface-raised prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-[6px] prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-card prose-pre:border-0 prose-pre:rounded-well
        prose-blockquote:border-l-on-air prose-blockquote:text-muted-foreground prose-blockquote:not-italic
        prose-hr:border-line
        prose-table:block prose-table:overflow-x-auto prose-table:rounded-well prose-table:bg-card md:prose-table:table md:prose-table:overflow-hidden
        [&_th]:px-4 [&_td]:px-4
        prose-th:bg-surface-raised prose-th:text-foreground prose-th:border-line
        prose-td:border-line prose-td:text-text-secondary
        prose-img:rounded-well
      `,
        className
      )}
    >
      {children}
    </article>
  )
}
