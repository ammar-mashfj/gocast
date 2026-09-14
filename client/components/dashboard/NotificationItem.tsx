"use client"

import Link from "next/link"
import { IconX } from "@tabler/icons-react"
import { NotificationIcon } from "@/components/dashboard/NotificationIcon"
import { formatDate } from "@/lib/format"
import { resolveNotificationAction, notificationLevelClass } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import type { Notification } from "@/interfaces/Notification"

interface NotificationItemProps {
  notification: Notification
  onRead: (id: string) => void
  onRemove: (id: string) => void
  /** Closes the panel when the row navigates away. */
  onNavigate: () => void
  /**
   * Hand this notification to whatever reveals its detail. Called INSTEAD of
   * navigating, for a payload whose action says to expand.
   *
   * A callback rather than a dialog rendered here, because the thing that
   * opens is not allowed to be a child of the popover — see NotificationBell.
   */
  onExpand: (notification: Notification) => void
}

/**
 * One row of the feed — and the only row component there will ever be.
 *
 * NOTHING HERE KNOWS WHAT KIND OF NOTIFICATION IT IS RENDERING. There is no
 * branch on `notification.type`, and adding one would undo the point of the
 * whole feature: the backend describes a notification in generic fields (see
 * interfaces/Notification.ts) and this renders those fields, which is why a new
 * notification is a PHP class and no client change at all. Anything that
 * genuinely cannot be expressed as title / body / icon / level / action is a
 * sign the payload needs a more general field, not that this needs a switch.
 *
 * The whole row is the click target when there is an action, because a feed
 * where the text is inert and only a small button navigates is a feed people
 * click at and nothing happens. Reading and navigating are the same gesture:
 * opening it is what marks it read.
 *
 * WHAT a click does is not decided here either — resolveNotificationAction
 * reads it out of the payload and this renders the answer. That keeps the one
 * branch below about markup (anchor vs button vs link) rather than about
 * meaning, which is what stops it from growing a case per notification.
 */
export function NotificationItem({
  notification,
  onRead,
  onRemove,
  onNavigate,
  onExpand,
}: NotificationItemProps) {
  const unread = notification.read_at === null
  const behaviour = resolveNotificationAction(notification)

  // `pr-9` on the row reserves the corner that the unread dot and the dismiss
  // button share — they swap on hover rather than sitting side by side, which
  // keeps the row one consistent width in both states.
  const rowClass = cn(
    "flex w-full gap-3 py-3 pr-9 pl-3 text-left transition-colors hover:bg-muted/60",
    unread && "bg-primary/[0.03]",
  )

  const content = (
    <>
      <div className={cn("mt-0.5 shrink-0", notificationLevelClass(notification.level))}>
        <NotificationIcon name={notification.icon} />
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", unread ? "font-medium" : "text-muted-foreground")}>
          {notification.title}
        </p>

        {notification.body && (
          // Clamped rather than truncated to one line: the body is a sentence
          // or two, and the first few words are rarely the useful part.
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {notification.body}
          </p>
        )}

        <p className="mt-1 text-[0.6875rem] text-muted-foreground/80">
          {formatDate(notification.created_at, "relative")}
        </p>
      </div>
    </>
  )

  function handleOpen() {
    onRead(notification.id)
    onNavigate()
  }

  // Marks read exactly as navigating does. Opening the detail IS opening the
  // notification, and a row you have just read the whole of staying bold is
  // the clearest possible way to look broken.
  function handleExpand() {
    onRead(notification.id)
    onExpand(notification)
  }

  return (
    <div className="group/row relative border-b last:border-b-0">
      {behaviour.kind === "none" ? (
        // No action means nowhere to go, so the row is a button whose only job
        // is to mark itself read — still clickable, because a row that looks
        // like the others and does nothing reads as broken.
        <button type="button" className={rowClass} onClick={() => onRead(notification.id)}>
          {content}
        </button>
      ) : behaviour.kind === "expand" ? (
        // A button, not a link, even though this notification has a URL: the
        // URL is the button INSIDE the detail, and rendering the row as an
        // anchor would put a destination in the status bar that clicking it
        // does not go to — as well as offering an open-in-new-tab that skips
        // the thing the payload asked to show first.
        <button type="button" className={rowClass} onClick={handleExpand}>
          {content}
        </button>
      ) : behaviour.external ? (
        <a
          href={behaviour.href}
          target="_blank"
          rel="noopener noreferrer"
          className={rowClass}
          onClick={handleOpen}
        >
          {content}
        </a>
      ) : (
        <Link href={behaviour.href} className={rowClass} onClick={handleOpen}>
          {content}
        </Link>
      )}

      {/* Hidden on hover, when the dismiss button takes this corner. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-4 right-3.5 size-2 rounded-full transition-opacity",
          unread ? "bg-primary group-hover/row:opacity-0" : "opacity-0",
        )}
      />

      {/* Outside the link, not inside it: a button nested in an anchor is
          invalid HTML and still navigates in some browsers. Absolutely
          positioned so it overlaps the row without being part of it. */}
      <button
        type="button"
        aria-label={`Dismiss "${notification.title}"`}
        className="absolute top-2.5 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none group-hover/row:opacity-100"
        onClick={() => onRemove(notification.id)}
      >
        <IconX size={14} />
      </button>
    </div>
  )
}
