import {
  IconAlertTriangle,
  IconArrowDown,
  IconBell,
  IconGift,
  IconMicrophone,
  IconRadio,
  IconSparkles,
  type IconProps,
} from "@tabler/icons-react"
import type { ForwardRefExoticComponent, RefAttributes } from "react"

type TablerIcon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

/**
 * Semantic icon key => glyph.
 *
 * THE FALLBACK IS THE POINT, not a safety net. The backend may ship a
 * notification carrying an icon key that predates this map — that is the whole
 * reason a new notification needs no client release — so an unknown key has to
 * be an ordinary, correct outcome rather than a hole in the row.
 *
 * Add a key here when a new notification deserves its own glyph. Until someone
 * does, it wears a bell, and nothing is broken in the meantime.
 */
const NOTIFICATION_ICONS: Record<string, TablerIcon> = {
  bell: IconBell,
  radio: IconRadio,
  microphone: IconMicrophone,
  invite: IconGift,
  "plan-upgraded": IconSparkles,
  "plan-expired": IconArrowDown,
  warning: IconAlertTriangle,
}

interface NotificationIconProps {
  /** The payload's `icon` field. Unrecognised values are expected. */
  name: string
  size?: number
  className?: string
}

/**
 * A notification's glyph, resolved from its semantic icon key.
 *
 * Its own component rather than a `notificationIcon(key)` helper called at the
 * render site: resolving a component with a function call and then rendering
 * the result is the pattern react-hooks/static-components flags, because it
 * usually means a component is being redefined every render. Here the lookup
 * is a table read, so the reference is stable — but keeping the lookup inside
 * a real component is both what satisfies the rule and the clearer shape.
 */
export function NotificationIcon({ name, size = 18, className }: NotificationIconProps) {
  const Glyph = NOTIFICATION_ICONS[name] ?? IconBell

  return <Glyph size={size} className={className} />
}
