import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const protectedRoutes = ["/dashboard"]
const authRoutes = ["/auth/login", "/auth/register"]

function isVerifiedUserCookie(value?: string): boolean {
  if (!value) return false

  try {
    const user = JSON.parse(decodeURIComponent(value))
    return Boolean(user?.email_verified_at)
  } catch {
    return false
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get("token")?.value
  const isVerified = isVerifiedUserCookie(request.cookies.get("user")?.value)

  // `?expired=1` comes from a dashboard page whose API call came back 401: the
  // cookies are still here but the session behind them is gone. Bouncing that
  // to the dashboard would loop straight back to the same 401.
  const sessionExpired = request.nextUrl.searchParams.get("expired") === "1"

  if (authRoutes.some((route) => pathname.startsWith(route)) && token && isVerified && !sessionExpired) {
    return NextResponse.redirect(new URL("/dashboard/stations", request.url))
  }

  if (protectedRoutes.some((route) => pathname.startsWith(route)) && (!token || !isVerified)) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  // /embed is public by design and renders inside other people's pages; it
  // never needs the auth cookie read, and keeping it out of the matcher means
  // a future protected-route change cannot accidentally redirect an iframe
  // to the login page.
  matcher: ["/((?!api|embed|_next/static|_next/image|.*\\.png$|.*\\.svg$).*)"],
}
