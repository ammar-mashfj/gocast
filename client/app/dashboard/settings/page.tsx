"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { IconAlertTriangle } from "@tabler/icons-react"
import api from "@/lib/axios"
import { saveAuth, clearAuth, getUser } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { VerifyEmailDialog } from "@/components/auth/VerifyEmailDialog"
import type { User } from "@/interfaces/User"

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [profileLoading, setProfileLoading] = useState(false)

  const [profileCurrentPassword, setProfileCurrentPassword] = useState("")
  const [profileError, setProfileError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [verifyOpen, setVerifyOpen] = useState(false)

  useEffect(() => {
    const u = getUser()
    if (u) {
      setUser(u)
      setName(u.name)
      setEmail(u.email)
    }
  }, [])

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setProfileError(null)
    setProfileLoading(true)
    try {
      const payload: Record<string, string> = {}
      const emailChanging = email !== user.email
      if (name !== user.name) payload.name = name
      if (emailChanging) payload.email = email
      if (Object.keys(payload).length === 0) {
        toast.info("Nothing changed")
        setProfileLoading(false)
        return
      }

      // Email change requires current password — the server also enforces
      // this, but surfacing it client-side avoids a round-trip.
      if (emailChanging) {
        if (!profileCurrentPassword) {
          setProfileError("Current password is required to change your email.")
          setProfileLoading(false)
          return
        }
        payload.current_password = profileCurrentPassword
      }

      const res = await api.patch("/account/profile", payload)
      const updated: User = res.data.data
      // Refresh the cookie-stored user so the navbar/dashboard see the new name/email immediately.
      saveAuth(null, updated)
      setUser(updated)
      setProfileCurrentPassword("")
      toast.success(res.data.message ?? "Profile saved")

      // Email changes null out verified on the server; open the verify modal
      // immediately so the user isn't stranded in a half-verified state where
      // gated actions start 403'ing without a clear recovery path.
      if (!updated.email_verified_at) {
        setVerifyOpen(true)
        return
      }

      router.refresh()
    } catch (err) {
      if (err instanceof AxiosError) {
        const fieldError = err.response?.data?.errors?.current_password?.[0]
        if (fieldError) {
          setProfileError(fieldError)
        } else {
          toast.error(err.response?.data?.message ?? "Update failed")
        }
      } else {
        toast.error("Update failed")
      }
    } finally {
      setProfileLoading(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setPasswordLoading(true)
    try {
      const payload: Record<string, string> = {
        password: newPassword,
        password_confirmation: newPasswordConfirmation,
      }
      if (user?.has_password !== false) {
        payload.current_password = currentPassword
      }

      await api.patch("/account/password", payload)
      toast.success(user?.has_password === false ? "Password set" : "Password changed")
      setCurrentPassword("")
      setNewPassword("")
      setNewPasswordConfirmation("")
      if (user?.has_password === false) {
        const updated = { ...user, has_password: true }
        saveAuth(null, updated)
        setUser(updated)
      }
    } catch (err) {
      const errors = err instanceof AxiosError ? err.response?.data?.errors : null
      const first = errors ? (Object.values(errors as Record<string, string[]>).flat()[0] as string) : null
      toast.error(first ?? (err instanceof AxiosError ? err.response?.data?.message : null) ?? "Password change failed")
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault()
    setDeleteLoading(true)
    try {
      await api.delete("/account", { data: { current_password: deletePassword } })
      clearAuth()
      toast.success("Account deleted — sorry to see you go.")
      router.push("/")
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message ?? "Delete failed" : "Delete failed"
      toast.error(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
              <Skeleton className="h-9 w-32" />
            </CardContent>
          </Card>
        ))}
        <Separator />
        <Card className="border-destructive/30 bg-destructive/[0.03]">
          <CardHeader className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasPassword = user.has_password !== false

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your name and email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {/* Current-password field only surfaces when the user is actually
                changing their email — avoids scaring a user into typing their
                password for a name edit. The server enforces the requirement
                regardless. */}
            {email !== user.email && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-current-password">Current password</Label>
                <Input
                  id="profile-current-password"
                  type="password"
                  value={profileCurrentPassword}
                  onChange={(e) => setProfileCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  aria-invalid={!!profileError}
                />
                <p className="text-xs text-muted-foreground">
                  Confirm your password to change the email on your account.
                </p>
                {profileError && <p className="text-xs text-destructive">{profileError}</p>}
              </div>
            )}

            <Button type="submit" disabled={profileLoading} className="self-start">
              {profileLoading ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{hasPassword ? "Change password" : "Set password"}</CardTitle>
          <CardDescription>
            {hasPassword
              ? "Other active sessions will be signed out after a successful change."
              : "Add a password so you can confirm future account changes without using Google."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            {hasPassword && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password-confirmation">Confirm new password</Label>
              <Input id="new-password-confirmation" type="password" value={newPasswordConfirmation} onChange={(e) => setNewPasswordConfirmation(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={passwordLoading} className="self-start">
              {passwordLoading ? "Updating…" : hasPassword ? "Update password" : "Set password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/30 bg-destructive/[0.03]">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <IconAlertTriangle size={16} />
            Danger zone
          </CardTitle>
          <CardDescription>
            Deleting your account permanently removes your stations and broadcast history. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </CardContent>
      </Card>

      <VerifyEmailDialog
        open={verifyOpen}
        email={user.email}
        onCancel={() => setVerifyOpen(false)}
      />

      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeletePassword("") }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              All your stations, broadcast sessions, and account data will be permanently removed. Confirm with your password to proceed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDelete} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Current password</Label>
              <Input id="delete-password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={deleteLoading || !deletePassword}>
                {deleteLoading ? "Deleting…" : "Delete forever"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
