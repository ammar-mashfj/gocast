"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Text entry, as the design system draws it: the label sits INSIDE a filled
 * box above the value (TextField), so a form reads as a stack of cards
 * rather than lines. An error turns the box's edge red and puts the message
 * under it, wired with aria-describedby.
 *
 * `Input` is the bare one-line control for inline use (the "add a link"
 * row), where a label would be noise.
 */

interface FieldShellProps {
  label: string
  error?: string | null
  hint?: React.ReactNode
  /** Right-hand slot inside the box: a "Show" toggle, a unit. */
  trailing?: React.ReactNode
  className?: string
  children: (ids: { id: string; describedBy: string | undefined }) => React.ReactNode
}

function FieldShell({ label, error, hint, trailing, className, children }: FieldShellProps) {
  const id = React.useId()
  const messageId = `${id}-message`
  const message = error ?? hint
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-button border-stroke bg-surface-control px-4 py-3 transition-colors",
          "focus-within:border-line-strong",
          error ? "border-live focus-within:border-live" : "border-transparent",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-caption font-semibold text-muted-foreground">
            {label}
          </label>
          {children({ id, describedBy: message ? messageId : undefined })}
        </div>
        {trailing}
      </div>
      {message && (
        <p id={messageId} role={error ? "alert" : undefined} className={cn("px-1 text-body-sm", error ? "text-error" : "text-text-faint")}>
          {message}
        </p>
      )}
    </div>
  )
}

const control =
  "w-full min-w-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-text-faint disabled:opacity-60"

export interface TextFieldProps extends Omit<React.ComponentProps<"input">, "id"> {
  label: string
  error?: string | null
  hint?: React.ReactNode
  trailing?: React.ReactNode
}

export function TextField({ label, error, hint, trailing, className, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} trailing={trailing} className={className}>
      {({ id, describedBy }) => (
        <input id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={control} {...props} />
      )}
    </FieldShell>
  )
}

/**
 * A password in a TextField, with Show / Hide at the right of the box (a
 * real button, aria-pressed), so you can check what you typed instead of
 * typing it twice.
 */
export function PasswordField(props: Omit<TextFieldProps, "type" | "trailing">) {
  const [shown, setShown] = React.useState(false)
  return (
    <TextField
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          aria-pressed={shown}
          aria-label={shown ? `Hide ${props.label.toLowerCase()}` : `Show ${props.label.toLowerCase()}`}
          onClick={() => setShown((s) => !s)}
          className="shrink-0 cursor-pointer rounded-item px-2 py-1 text-body-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown ? "Hide" : "Show"}
        </button>
      }
    />
  )
}

export interface TextAreaFieldProps extends Omit<React.ComponentProps<"textarea">, "id"> {
  label: string
  error?: string | null
  hint?: React.ReactNode
}

export function TextAreaField({ label, error, hint, className, rows = 3, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={className}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          rows={rows}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(control, "resize-none leading-relaxed")}
          {...props}
        />
      )}
    </FieldShell>
  )
}

/** One line, no label: 44px on the control surface. Give it an aria-label. */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full min-w-0 rounded-control bg-surface-control px-3.5 text-sm font-medium text-foreground outline-none",
        "placeholder:text-text-faint focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-live disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}
