import axios from "axios"
import { toast } from "sonner"
import { getCookie } from "./cookies"
import { clearAuth } from "@/actions/auth"
import { env } from "./env"

/** Axios instance preconfigured with API base URL and auth token interceptor. */
const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
})

api.interceptors.request.use((config) => {
  const token = getCookie("token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Guard against the redirect firing twice if multiple in-flight requests
// each receive a 401 simultaneously.
let expiredRedirectInFlight = false

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      error.response?.status === 401 &&
      !error.config?.url?.includes("/login") &&
      !error.config?.url?.includes("/register") &&
      !expiredRedirectInFlight
    ) {
      expiredRedirectInFlight = true
      clearAuth()
      // ?expired=1 lets the login page show a contextual toast/banner.
      window.location.href = "/auth/login?expired=1"
    }

    // Defence in depth against an unverified action slipping past the UI gate
    // (e.g. admin un-verifies a user mid-session). Our custom middleware tags
    // the response with a stable `code` — string-matching the message would
    // break under translation or framework wording changes.
    if (
      typeof window !== "undefined" &&
      error.response?.status === 403 &&
      error.response?.data?.code === "email_unverified"
    ) {
      toast.error("Verify your email to continue.")
    }

    return Promise.reject(error)
  },
)

export default api
