"use client"

import { useState, type FormEvent } from "react"
import { AxiosError } from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import { saveAuth } from "@/actions/auth"
import type { User } from "@/interfaces/User"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { PasswordField } from "@/components/ds/Field"

/**
 * Change the password, or set one on an account that signed up with Google
 * (no current password to give). One new-password field with Show instead of
 * typing it twice; the API's `confirmed` rule gets the same value.
 */
export function PasswordForm({ user, onUpdated }: { user: User; onUpdated: (user: User) => void }) {
  const hasPassword = user.has_password !== false
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch("/account/password", {
        ...(hasPassword && { current_password: current }),
        password: next,
        password_confirmation: next,
      })
      toast.success(hasPassword ? "Password changed" : "Password set")
      setCurrent("")
      setNext("")
      if (!hasPassword) {
        const updated = { ...user, has_password: true }
        saveAuth(null, updated)
        onUpdated(updated)
      }
    } catch (err) {
      const errors = err instanceof AxiosError ? (err.response?.data?.errors as Record<string, string[]> | undefined) : undefined
      const first = errors ? Object.values(errors).flat()[0] : null
      toast.error(first ?? (err instanceof AxiosError && err.response?.data?.message) ?? "Couldn’t change your password")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card asChild>
      <form onSubmit={submit}>
        <CardHeader
          title={hasPassword ? "Password" : "Set a password"}
          description={
            hasPassword
              ? "Changing it signs you out everywhere else."
              : "You sign in with Google. A password lets you confirm account changes without it."
          }
        />
        {hasPassword && (
          <PasswordField label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        )}
        <PasswordField
          label="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <div>
          <Button type="submit" variant="ghost" disabled={saving || next.length < 8 || (hasPassword && !current)}>
            {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
          </Button>
        </div>
      </form>
    </Card>
  )
}
