'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconChevronDown } from "@tabler/icons-react"
import { toast } from "sonner"
import api from "@/lib/axios"
import { clearAuth } from "@/actions/auth"

interface UserMenuProps {
  name: string
}

export default function UserMenu({ name }: UserMenuProps) {
  const router = useRouter()

  async function handleSignOut() {
    try {
      await api.post("/logout")
    } finally {
      clearAuth()
      toast.success("Signed out successfully")
      router.push("/")
      router.refresh()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 text-text-muted text-[15px] tracking-wide bg-transparent border-none cursor-pointer hover:text-white/80 transition-colors">
          My Account
          <IconChevronDown size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
