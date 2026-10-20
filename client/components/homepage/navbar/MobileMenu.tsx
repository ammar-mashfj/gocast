"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ds/Button"

interface NavLink {
  label: string
  href: string
}

interface MobileMenuProps {
  links: readonly NavLink[]
  authed: boolean
}

const ROW =
  "flex min-h-14 items-center border-b border-line font-display text-title-sm font-bold text-foreground no-underline"

/**
 * The phone menu, as the comp draws it: a "Menu / Close" button in the header
 * and, below the header, a full-width list of the same links as 56px rows in
 * display type, then Sign in and a full-width Sign up. Not a side sheet: the
 * page is short enough that a list under the bar reads as part of it.
 *
 * The panel is absolutely positioned under the sticky header (sticky is a
 * containing block, so no wrapper is needed and the server-rendered Navbar
 * stays as it is); it closes on a link, on Escape, on a tap outside it and
 * when the viewport grows past md (the breakpoint where the inline links
 * appear).
 */
export default function MobileMenu({ links, authed }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    // A tap anywhere that is not the button or the panel closes it. pointerdown
    // rather than click so it closes as the finger lands, before whatever is
    // underneath gets the tap.
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const mq = window.matchMedia("(min-width: 48rem)")
    const onWide = () => { if (mq.matches) setOpen(false) }
    window.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointer)
    mq.addEventListener("change", onWide)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointer)
      mq.removeEventListener("change", onWide)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={rootRef} className="contents">
      <Button
        variant="subtle"
        size="md"
        className="md:hidden font-bold"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : "Menu"}
      </Button>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Site"
          className="absolute inset-x-0 top-full flex flex-col border-y border-line bg-background px-gutter pt-1 pb-5 md:hidden"
        >
          {links.map((link) => (
            <a key={link.label} href={link.href} onClick={close} className={ROW}>
              {link.label}
            </a>
          ))}
          {authed ? (
            <div className="pt-4">
              <Button asChild size="lg" full>
                <Link href="/dashboard" onClick={close} className="no-underline">Open dashboard</Link>
              </Button>
            </div>
          ) : (
            <>
              <Link href="/auth/login" onClick={close} className={ROW.replace(" border-b border-line", "")}>
                Sign in
              </Link>
              <div className="pt-1">
                <Button asChild size="lg" full>
                  <Link href="/auth/register" onClick={close} className="no-underline">Sign up</Link>
                </Button>
              </div>
            </>
          )}
        </nav>
      )}
    </div>
  )
}
