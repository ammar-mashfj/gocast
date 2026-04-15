import axios from "axios"
import { getCookie } from "./cookies"
import { clearAuth } from "@/actions/auth"
import { env } from "./env"

/** Axios instance preconfigured with API base URL and auth token interceptor. */
const api = axios.create({
  baseURL: env.apiUrl,
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes("/login") &&
      !error.config?.url?.includes("/register")
    ) {
      clearAuth()
      window.location.href = "/auth/login"
    }
    return Promise.reject(error)
  },
)

export default api
