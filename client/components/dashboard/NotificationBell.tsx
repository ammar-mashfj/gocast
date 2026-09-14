"use client"

import { useRef, useState } from "react"
import { IconBell, IconChecks } from "@tabler/icons-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { NotificationItem } from "@/components/dashboard/NotificationItem"
import { NotificationDetailDialog } from "@/components/dashboard/NotificationDetailDialog"
import { useNotifications } from "@/hooks/useNotifications"
import { formatUnreadCount } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import type { Notification } from "@/interfaces/Notification"

/**
 * The dashboard bell.
 *
 * The badge is live and the feed is lazy: the count polls on a timer, and the
 * rows are not fetched until somebody actually opens the panel — see
 * useNotifications for why that split is worth the second endpoint.
 *
 * Note what this component does NOT contain: any knowledge of a particular
 * notification. It renders whatever the API hands back through one row
 * component, so the set of notifications the product can send is a backend
 * concern from here on.
 *
 * It also owns the detail dialog, which is why that is a sibling of the
 * popover down there rather than living in NotificationItem where it is
 * actually triggered. Two reasons, both load-bearing:
 *
 *   • A dialog rendered inside the popover unmounts the moment the popover
 *     closes — and the popover has to close, because two stacked Radix layers
 *     each trap focus and each mark the rest of the page aria-hidden.
 *   • Only one can ever be open, so one piece of state here is the whole
 *     mechanism, rather than one per row.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)

  /** The notification whose detail is showing, or null. */
  const [detail, setDetail] = useState<Notification | null>(null)

  /**
   * The popover is closing in order to hand off to the dialog.
   *
   * Radix returns focus to the popover's trigger when it closes, and that
   * lands one frame after the dialog has taken focus for itself — so without
   * this the bell button steals it back and the dialog opens with nothing
   * focused, unreachable by keyboard and closing on the first Escape only
   * because the browser has no better target. Suppressed for the handoff
   * ONLY; an ordinary close still restores focus, which is what a keyboard
   * user needs when they dismiss the panel.
   */
  const handingOff = useRef(false)
  const {
    items,
    unreadCount,
    cappedAt,
    loading,
    loadingMore,
    hasMore,
    failed,
    loadFeed,
    loadMore,
    markRead,
    markAllRead,
    remove,
  } = useNotifications()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) loadFeed()
  }

  function handleExpand(notification: Notification) {
    handingOff.current = true
    setOpen(false)
    setDetail(notification)
  }

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <IconBell size={18} />

          {unreadCount > 0 && (
            <span
              // Not the Badge component: that one is a 20px pill sized for
              // inline text, and this has to sit in the corner of an icon
              // button without making it taller.
              className={cn(
                "absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center",
                "rounded-full bg-primary px-1 text-[0.625rem] leading-none font-medium text-primary-foreground",
              )}
            >
              {formatUnreadCount(unreadCount, cappedAt)}
            </span>
          )}
        </PopoverTrigger>

        {/* `gap-0` is not decoration: PopoverContent is `flex flex-col gap-4` by
            default, sized for the stacked header/description content it usually
            holds. `p-0` overrides its padding, but the gap survives and puts a
            16px band between the header's bottom border and the first row.

            `overflow-hidden` is the other half of taking the padding away. The
            content is `rounded-lg` and does not clip — it never needed to, since
            its own padding normally keeps children away from the corners. Going
            edge-to-edge puts the header's bottom border and the rows' hover and
            unread backgrounds right into them, and unclipped they paint square
            over the radius. DropdownMenuContent clips for the same reason. */}
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[22rem] gap-0 overflow-hidden p-0 sm:w-96"
          onCloseAutoFocus={(event) => {
            if (handingOff.current) {
              handingOff.current = false
              event.preventDefault()
            }
          }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <IconChecks size={14} />
                Mark all read
              </button>
            )}
          </div>

          {/* Capped height rather than sized to content: the feed grows without
              limit and a popover taller than the viewport cannot be scrolled
              back to the top of.

              The cap goes on the VIEWPORT, not on the ScrollArea root, and that
              is the whole reason for the selector. ScrollArea puts its className
              on the Radix root, which gets `position: relative` and nothing else
              — no overflow — while the viewport inside it is `size-full` with
              `overflow-y: scroll`. A `max-h-*` on the root leaves the root's
              height auto, so the viewport's `h-full` resolves to auto too (a
              percentage height needs a definite containing block; max-height
              does not make one), the viewport never becomes scrollable, and the
              rows spill straight out of the popover instead. Clamping the
              viewport gives it the definite height it needs and lets the root
              shrink to match. */}
          <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[26rem]">
            {loading ? (
              <div className="space-y-3 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="size-[18px] shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : failed ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-muted-foreground">Couldn&apos;t load notifications.</p>
                <button
                  type="button"
                  onClick={loadFeed}
                  className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 && !hasMore ? (
              /* `!hasMore` is what keeps this branch honest. Dismissing every row
                 on the loaded page empties `items` while older pages are still
                 unread behind the cursor, and without the guard that renders
                 "You're all caught up" above a badge that is still counting them
                 — with the button that would fetch them stranded in the branch
                 below. Falling through leaves the list empty and the button
                 reachable, which is the true state. */
              <div className="px-3 py-10 text-center">
                <IconBell size={22} className="mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">You&apos;re all caught up</p>
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  Plan changes and station news land here.
                </p>
              </div>
            ) : (
              <>
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markRead}
                    onRemove={remove}
                    onNavigate={() => setOpen(false)}
                    onExpand={handleExpand}
                  />
                ))}

                {hasMore && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-60"
                  >
                    {loadingMore ? "Loading…" : "Load older"}
                  </button>
                )}
              </>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <NotificationDetailDialog notification={detail} onClose={() => setDetail(null)} />
    </>
  )
}
