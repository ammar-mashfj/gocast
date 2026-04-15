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





export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!email) newErrors.email = "Email is required."
    if (!password) newErrors.password = "Password is required."
    return newErrors
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const newErrors = validate()
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setLoading(true)
    try {
      const response = await axios.post("/auth/login", { email, password })
      if (response.status === 200) {
        saveAuth(response.data.token, response.data.data)
        toast.success("Login successful")
        router.push("/")
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        toast.error(error.response?.data?.message || "Invalid credentials")
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
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription className="text-sm">
          Enter your credentials to access your account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 h-9 w-full text-sm"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-sm text-muted-foreground">Or</span>
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
          By signing in with Google, you agree to our{" "}
          <Link href="/terms" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>.
        </p>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/register"
            className="text-primary underline-offset-4 hover:underline text-sm"
          >
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
