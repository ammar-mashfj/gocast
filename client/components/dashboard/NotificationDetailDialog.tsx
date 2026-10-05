"use client"

import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ds/Dialog"
import { resolveNotificationAction } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import type { Notification } from "@/interfaces/Notification"

interface NotificationDetailDialogProps {
  /** The notification being revealed, or null when nothing is. */
  notification: Notification | null
  onClose: () => void
}

/**
 * The longer version of a notification — what an `expand` action reveals.
 *
 * LIKE NotificationItem, THIS KNOWS NOTHING ABOUT WHICH NOTIFICATION IT IS
 * SHOWING. It renders title / body / points / action out of the payload, so
 * the next notification that has more to say than a row can hold says so in
 * PHP and appears here with no client change. The moment this file needs to
 * know that ProAccessGranted exists, the feature has lost the property it was
 * built for.
 *
 * Why a dialog and not a bigger row: the content it shows is the middle length
 * between the row (one sentence) and the email (an onboarding document), and
 * there was previously nowhere to put it. Expanding in place inside a 400px
 * popover that already scrolls would push the rest of the feed around.
 *
 * Rendered as a SIBLING of the popover, never inside it — see UpdatesMenu.
 */
export function NotificationDetailDialog({
  notification,
  onClose,
}: NotificationDetailDialogProps) {
  // Resolved rather than read straight off `action`, so the button obeys the
  // same origin and scheme rules as the row does — including refusing a URL
  // this app should not link to at all, in which case the dialog is still
  // worth showing for its text and simply has no button.
  const behaviour = notification ? resolveNotificationAction(notification) : { kind: "none" as const }
  const detail = notification?.action?.detail ?? null
  const label = notification?.action?.label ?? "Open"

  return (
    <Dialog
      open={notification !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {/* Guarded rather than rendered unconditionally: everything below reads
          the notification, and Radix keeps the content mounted through its
          close animation, so an unguarded body would spend that frame reading
          a payload that is already gone. */}
      {notification && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{notification.title}</DialogTitle>

            {notification.body && (
              // Unclamped, unlike the row. Being able to read the whole
              // sentence is half the reason this dialog exists.
              <DialogDescription>
                {notification.body}
              </DialogDescription>
            )}
          </DialogHeader>

          {detail && (
            <div className="rounded-well bg-card p-4">
              {detail.heading && (
                <p className="eyebrow text-text-faint">
                  {detail.heading}
                </p>
              )}

              <ul className={cn("space-y-2", detail.heading && "mt-2.5")}>
                {detail.points.map((point) => (
                  // Keyed by content: the backend sends plain sentences with
                  // no ids, and this list is static for the life of the
                  // dialog — nothing reorders, inserts, or removes.
                  <li key={point} className="flex gap-2 text-sm leading-relaxed">
                    <IconCheck
                      size={15}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {behaviour.kind !== "none" && (
            <DialogFooter>
              {behaviour.external ? (
                <Button size="lg" asChild>
                  <a href={behaviour.href} target="_blank" rel="noopener noreferrer" onClick={onClose}>
                    {label}
                  </a>
                </Button>
              ) : (
                <Button size="lg" asChild>
                  {/* Closing on click rather than on route change: the dialog
                      is not inside the page being navigated away from, so
                      nothing unmounts it on its own. */}
                  <Link href={behaviour.href} onClick={onClose}>
                    {label}
                  </Link>
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
