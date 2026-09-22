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
        prose-headings:text-white prose-headings:font-display prose-headings:font-semibold prose-headings:-tracking-wide
        prose-h2:text-2xl md:prose-h2:text-3xl prose-h2:mt-14 prose-h2:mb-5
        prose-h3:text-xl md:prose-h3:text-2xl prose-h3:mt-10 prose-h3:mb-4
        prose-p:text-[17px] prose-p:text-zinc-300 prose-p:leading-[1.75] prose-p:tracking-[0.01em] prose-p:text-pretty
        prose-li:text-[17px] prose-li:text-zinc-300 prose-li:leading-[1.75] prose-li:tracking-[0.01em]
        prose-strong:text-white
        prose-a:text-violet prose-a:underline prose-a:underline-offset-4 prose-a:decoration-violet-full/40 hover:prose-a:decoration-violet-full
        prose-code:text-violet prose-code:bg-white/[0.04] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/[0.06] prose-pre:rounded-xl
        prose-blockquote:border-l-violet-full prose-blockquote:text-text-muted prose-blockquote:not-italic
        prose-hr:border-white/[0.06]
        prose-table:border prose-table:border-white/[0.06] prose-table:rounded-xl prose-table:overflow-hidden
        prose-th:bg-white/[0.02] prose-th:text-white prose-th:border-white/[0.06]
        prose-td:border-white/[0.06] prose-td:text-zinc-300
        prose-img:rounded-xl prose-img:border prose-img:border-white/[0.06]
      `,
        className
      )}
    >
      {children}
    </article>
  )
}
