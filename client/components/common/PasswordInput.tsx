"use client"

import { useState, type ComponentProps } from "react"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  /**
   * Drive visibility from outside, for a new + confirm pair: the confirm
   * field follows the same `shown` so the two can be compared by eye. Leave
   * both off and the field keeps its own state.
   */
  shown?: boolean
  onShownChange?: (shown: boolean) => void
}

/**
 * A password field with a show/hide eye. Clarity recorded sign-ups clicking
 * back into the password fields and retyping them; seeing what was typed is
 * the cheapest fix for a typo nobody can find.
 */
export function PasswordInput({ className, shown, onShownChange, ...props }: PasswordInputProps) {
  const [ownShown, setOwnShown] = useState(false)
  const visible = shown ?? ownShown

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => (onShownChange ? onShownChange(!visible) : setOwnShown(!visible))}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  )
}
