"use client"

import { useState } from "react"
import { IconCopy, IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

interface CopyButtonProps {
  text: string
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? <IconCheck data-icon="inline-start" /> : <IconCopy data-icon="inline-start" />}
      {copied ? "Copied!" : "Copy"}
    </Button>
  )
}
