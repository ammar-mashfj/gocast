"use client"

import { useState } from "react"
import { IconShare, IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { shareOrCopy } from "@/lib/share"

interface CopyButtonProps {
  text: string
  title?: string
  variant?: "ghost" | "outline"
}

export function CopyButton({ text, title, variant = "ghost" }: CopyButtonProps) {
  const [done, setDone] = useState(false)

  async function handleShare() {
    await shareOrCopy(text, title)
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }

  return (
    <Button variant={variant} size="sm" onClick={handleShare}>
      {done ? <IconCheck data-icon="inline-start" /> : <IconShare data-icon="inline-start" />}
      <span>{done ? "Done!" : "Share"}</span>
    </Button>
  )
}
