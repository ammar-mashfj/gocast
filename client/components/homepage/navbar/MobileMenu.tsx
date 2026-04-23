"use client"

import { useState } from "react"
import Link from "next/link"
import { IconMenu2 } from "@tabler/icons-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

interface NavLink {
  label: string
  href: string
}

interface MobileMenuProps {
  links: readonly NavLink[]
  authed: boolean
}

export default function MobileMenu({ links, authed }: MobileMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Open menu"
          className="sm:hidden inline-flex items-center justify-center size-9 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          <IconMenu2 size={18} />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] bg-background">
        <SheetHeader>
          <SheetTitle className="text-base font-medium">Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 mt-2">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-lg text-base text-text-secondary no-underline hover:text-white hover:bg-white/5 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {!authed && (
          <div className="border-t border-border-subtle mt-4 px-4 pt-4 flex flex-col gap-2">
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-lg text-base text-text-secondary no-underline text-center hover:text-white hover:bg-white/5 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/register"
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-lg text-base text-white text-center bg-violet-full hover:brightness-110 transition-all no-underline"
            >
              Sign up
            </Link>
          </div>
        )}

        {authed && (
          <div className="border-t border-border-subtle mt-4 px-4 pt-4">
            <Link
              href="/dashboard/stations"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-base text-white text-center bg-violet-full hover:brightness-110 transition-all no-underline"
            >
              Open dashboard
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
