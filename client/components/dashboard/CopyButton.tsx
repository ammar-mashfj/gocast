"use client"

import { useState } from "react"
import { IconShare, IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { shareOrCopy } from "@/lib/share"

interface CopyButtonProps {
  text: string
  title?: string
}

export function CopyButton({ text, title }: CopyButtonProps) {
  const [done, setDone] = useState(false)

  async function handleShare() {
    await shareOrCopy(text, title)
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleShare}>
      {done ? <IconCheck data-icon="inline-start" /> : <IconShare data-icon="inline-start" />}
      {done ? "Done!" : "Share"}
    </Button>
  )
}
