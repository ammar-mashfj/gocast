"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import api from "@/lib/axios"
import { saveAuth } from "@/actions/auth"
import type { User } from "@/interfaces/User"
import { VerifyEmailDialog } from "./VerifyEmailDialog"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { PasswordField, TextField } from "@/components/ds/Field"

/**
 * Name and email. Save stays off until something changed. Changing the
 * email asks for the current password (the server requires it) and then
 * opens the verify dialog, because the new address starts unverified and
 * gated actions would otherwise start failing with no way back.
 */
export function ProfileForm({ user, onUpdated }: { user: User; onUpdated: (user: User) => void }) {
  const router = useRouter()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [password, setPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)

  const emailChanging = email.trim() !== user.email
  const clean = name.trim() === user.name && !emailChanging

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (clean) return
    setPasswordError(null)
    if (emailChanging && !password) {
      setPasswordError("Enter your current password to change your email.")
      return
    }

    const payload: Record<string, string> = {}
    if (name.trim() !== user.name) payload.name = name.trim()
    if (emailChanging) {
      payload.email = email.trim()
      payload.current_password = password
    }

    setSaving(true)
    try {
      const res = await api.patch("/account/profile", payload)
      const updated: User = res.data.data
      // The cookie copy is what the sidebar and top bar read.
      saveAuth(null, updated)
      onUpdated(updated)
      setPassword("")
      toast.success(res.data.message ?? "Profile saved")
      if (!updated.email_verified_at) {
        setVerifyOpen(true)
        return
      }
      router.refresh()
    } catch (err) {
      const fieldError = err instanceof AxiosError ? err.response?.data?.errors?.current_password?.[0] : null
      if (fieldError) setPasswordError(fieldError)
      else toast.error((err instanceof AxiosError && err.response?.data?.message) || "Couldn’t save your profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card asChild>
        <form onSubmit={submit}>
          <CardHeader title="Profile" />
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={255} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          {emailChanging && (
            <PasswordField
              label="Current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              error={passwordError}
              hint="Needed to change the email on your account."
            />
          )}
          <div>
            <Button type="submit" disabled={clean || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
      {/* Outside the form: React events bubble through portals, so a submit
          inside the dialog would otherwise reach this form's onSubmit. */}
      <VerifyEmailDialog open={verifyOpen} email={user.email} onCancel={() => setVerifyOpen(false)} />
    </>
  )
}
