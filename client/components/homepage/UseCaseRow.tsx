"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "./heroSection/HeroHandover"

const STEP_MS = 4000

/** Scroll the row by one card (its width plus the gap). Scrolls the row
 * itself, never scrollIntoView, which would also move the page. */
function step(ul: HTMLUListElement, dir: 1 | -1) {
  const li = ul.children[0] as HTMLElement | undefined
  if (!li) return
  const gap = Number.parseFloat(getComputedStyle(ul).columnGap) || 0
  ul.scrollBy({ left: dir * (li.getBoundingClientRect().width + gap), behavior: "smooth" })
}

/**
 * The "Who it's for" cards as one scrolling row at every width (native
 * scroll snap, the next card peeking in), with prev/next arrows.
 *
 * It advances one card every four seconds and wraps to the start at the
 * end. It holds while the pointer is over the row or focus is inside it,
 * while the row is off screen and while the tab is hidden; it never starts
 * under reduced motion; and once the visitor uses an arrow, swipes or
 * wheels it, it stops for good — they are driving now.
 */
export function UseCaseRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const still = useReducedMotion()
  const [edges, setEdges] = useState({ start: true, end: false })
  const took = useRef(false)
  const held = useRef(false)

  const measure = useCallback(() => {
    const ul = ref.current
    if (!ul) return
    const start = ul.scrollLeft <= 2
    const end = ul.scrollLeft + ul.clientWidth >= ul.scrollWidth - 2
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
  }, [])

  const move = (dir: 1 | -1) => {
    const ul = ref.current
    if (ul) step(ul, dir)
  }

  const go = (dir: 1 | -1) => {
    took.current = true
    move(dir)
  }

  useEffect(() => {
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  useEffect(() => {
    const ul = ref.current
    if (!ul || still) return
    let inView = false
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
    })
    io.observe(ul)
    const t = setInterval(() => {
      if (took.current || held.current || !inView || document.hidden) return
      const atEnd = ul.scrollLeft + ul.clientWidth >= ul.scrollWidth - 2
      if (atEnd) ul.scrollTo({ left: 0, behavior: "smooth" })
      else step(ul, 1)
    }, STEP_MS)
    return () => {
      clearInterval(t)
      io.disconnect()
    }
  }, [still])

  const take = () => {
    took.current = true
  }

  return (
    <div
      className="flex flex-col gap-5"
      onMouseEnter={() => (held.current = true)}
      onMouseLeave={() => (held.current = false)}
      onFocus={() => (held.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) held.current = false
      }}
    >
      <ul
        ref={ref}
        id="use-cases"
        role="list"
        onScroll={measure}
        onTouchStart={take}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) take()
        }}
        className={cn(
          "-mx-gutter flex snap-x snap-mandatory scroll-px-gutter gap-3 overflow-x-auto px-gutter [scrollbar-width:none] lg:gap-4 [&::-webkit-scrollbar]:hidden",
          // Fade whichever edge still has cards behind it, so the cut card
          // reads as "more this way" rather than as clipped.
          !edges.start && !edges.end && "mask-[linear-gradient(to_right,transparent,#000_3rem,#000_calc(100%-3rem),transparent)]",
          edges.start && !edges.end && "mask-[linear-gradient(to_right,#000_calc(100%-3rem),transparent)]",
          !edges.start && edges.end && "mask-[linear-gradient(to_right,transparent,#000_3rem)]",
        )}
      >
        {children}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="subtle"
          size="icon"
          aria-label="Previous"
          aria-controls="use-cases"
          disabled={edges.start}
          onClick={() => go(-1)}
        >
          <IconChevronLeft />
        </Button>
        <Button
          variant="subtle"
          size="icon"
          aria-label="Next"
          aria-controls="use-cases"
          disabled={edges.end}
          onClick={() => go(1)}
        >
          <IconChevronRight />
        </Button>
      </div>
    </div>
  )
}
