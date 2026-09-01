"use client"

import { useState } from "react"
import { ProAccessDialog } from "@/components/ProAccessDialog"

interface Props {
  plan: string
  className?: string
  children: React.ReactNode
  /** Copy overrides passed straight through; default to the Pro wording. */
  title?: string
  description?: string
  confirmation?: string
  submitLabel?: string
}

/**
 * The public enquiry trigger on the pricing page.
 *
 * Only the Custom card uses this now. Pro lost its button here deliberately:
 * access is granted by hand after looking at a real station, so a request
 * from someone who has never signed up is not something anyone can act on,
 * and the form was converting curious visitors into form-fills instead of the
 * signup we actually want. Custom is the genuine exception — a network sizing
 * up a white-label deal has no account yet and should not need one to talk
 * to us.
 *
 * Nothing but a button and the open state — the form itself lives in
 * ProAccessDialog, shared with the in-dashboard Pro request so the two
 * surfaces cannot drift apart on the questions they ask. `social` is required
 * server-side, so a form that skipped it would be rejected on submit.
 */
export default function WaitlistButton({ plan, className, children, ...copy }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ProAccessDialog open={open} onOpenChange={setOpen} plan={plan} {...copy} />
    </>
  )
}
