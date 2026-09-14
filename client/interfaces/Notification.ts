/**
 * One row of the dashboard bell feed.
 *
 * THIS FILE IS THE WHOLE FRONT END'S KNOWLEDGE OF NOTIFICATIONS. There is no
 * per-type component, no map of type => renderer, and nothing here names a
 * specific notification — the backend describes each one in these fields and
 * NotificationItem renders whatever it is handed. That is what lets a new
 * notification ship as one PHP class with no client release: see
 * App\Notifications\Bell\BellPayload, which is the other end of this contract.
 *
 * The corollary is that this interface must stay generic. A field added here
 * for one notification's benefit is the beginning of a type switch.
 */

/** Tone. Drives colour and nothing else. */
export type NotificationLevel = "info" | "success" | "warning" | "error"

/**
 * Which part of the product the notification is about. Used for filtering.
 *
 * Widened with `(string & {})` deliberately: the backend may add a category
 * before this file knows about it, and a payload arriving with an unknown one
 * must be a value this code can hold rather than a type error — the filter
 * simply won't offer it until someone adds it here.
 */
export type NotificationCategory =
  | "station"
  | "account"
  | "plan"
  | "system"
  | (string & {})

/**
 * What clicking the notification does.
 *
 * Widened like NotificationCategory, and for a sharper reason: this drives
 * BEHAVIOUR, so a mode this build has never heard of must resolve to something
 * sensible rather than to nothing happening. See resolveNotificationAction,
 * which falls back to "link".
 */
export type NotificationActionMode = "link" | "expand" | (string & {})

/** The longer version of a notification, revealed by an `expand` action. */
export interface NotificationDetail {
  heading: string | null
  /** Plain sentences. No markup — each renderer formats these itself. */
  points: string[]
}

export interface NotificationAction {
  /**
   * Optional because rows written before modes existed do not carry one, and
   * notification rows are never migrated. Absent means "link".
   */
  mode?: NotificationActionMode
  label: string
  url: string
  /** Present only with an `expand` mode. */
  detail?: NotificationDetail | null
}

export interface Notification {
  id: string
  /** Fully-qualified PHP class name. For keys and analytics — never for rendering. */
  type: string
  title: string
  body: string | null
  /**
   * Semantic icon key, not a component name. Unknown values are expected and
   * fall back to a bell — see NOTIFICATION_ICONS.
   */
  icon: string
  level: NotificationLevel
  category: NotificationCategory
  action: NotificationAction | null
  /** Type-specific extras. Passed through untouched; not for layout. */
  meta: Record<string, unknown>
  /** Null while unread. */
  read_at: string | null
  created_at: string
}

/** `GET /notifications` — cursor-paginated. */
export interface NotificationPage {
  data: Notification[]
  links: { next: string | null; prev: string | null }
  meta: { unread_count: number }
}

/** `GET /notifications/unread-count`. */
export interface UnreadCount {
  unread_count: number
  /** Render anything above this as `${capped_at}+`. */
  capped_at: number
}
