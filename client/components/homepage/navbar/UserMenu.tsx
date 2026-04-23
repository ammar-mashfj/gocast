'use client'

import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconChevronDown, IconLoader2 } from "@tabler/icons-react"
import { useSignOut } from "@/hooks/useSignOut"

interface UserMenuProps {
  name: string
}

export default function UserMenu({ name }: UserMenuProps) {
  const { signOut, signingOut } = useSignOut()
  const firstName = name.split(/\s+/)[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 text-text-muted text-base tracking-wide bg-transparent border-none cursor-pointer hover:text-white/80 transition-colors">
          {firstName}
          <IconChevronDown size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onClick={() => signOut()}>
          {signingOut && <IconLoader2 className="animate-spin" />}
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
