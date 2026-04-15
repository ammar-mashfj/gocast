"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { IconBrandGoogleFilled } from "@tabler/icons-react"
import axios from "@/lib/axios"
import { useRouter } from "next/navigation"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { saveAuth } from "@/actions/auth"
import { env } from "@/lib/env"

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!name) newErrors.name = "Name is required."
    if (!email) newErrors.email = "Email is required."
    if (!password) newErrors.password = "Password is required."
    else if (password.length < 8)
      newErrors.password = "Password must be at least 8 characters."
    if (password !== passwordConfirmation)
      newErrors.passwordConfirmation = "Passwords do not match."
    return newErrors
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const newErrors = validate()
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setLoading(true)
    try {
      const response = await axios.post("/auth/register", {
        name,
        email,
        password,
        password_confirmation: passwordConfirmation,
      })
      if (response.status === 200 || response.status === 201) {
        saveAuth(response.data.token, response.data.data)
        toast.success("Account created successfully")
        router.push("/")
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        const errData = error.response?.data
        const fieldError = errData?.errors
          ? Object.values(errData.errors as Record<string, string[]>).flat()[0]
          : null
        toast.error(fieldError || errData?.message || "Registration failed")
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Create an account</CardTitle>
        <CardDescription className="text-sm">
          Get started with your free GoCast account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password-confirmation">
              Confirm password
            </Label>
            <Input
              id="password-confirmation"
              type="password"
              placeholder="********"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              aria-invalid={!!errors.passwordConfirmation}
            />
            {errors.passwordConfirmation && (
              <p className="text-xs text-destructive">
                {errors.passwordConfirmation}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 h-9 w-full text-sm"
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-sm text-muted-foreground">or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 cursor-pointer text-sm h-9"
          asChild
        >
          <a href={`${env.apiUrl}/auth/google`}>
            <IconBrandGoogleFilled />
            Continue with Google
          </a>
        </Button>
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <p className="text-[11px] text-muted-foreground/50 text-center leading-relaxed">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>.
        </p>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-primary underline-offset-4 hover:underline text-sm"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
