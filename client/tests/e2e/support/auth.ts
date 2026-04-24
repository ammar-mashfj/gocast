import { execFileSync } from "node:child_process"
import path from "node:path"
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test"

export const E2E_PASSWORD = "Password123!"
export const EMAIL_CODE = "123456"
export const RESET_CODE = "654321"

const apiRoot = path.resolve(process.cwd(), "../api")

type UserOptions = {
  email: string
  name?: string
  password?: string
  verified?: boolean
  code?: string
}

export function uniqueEmail(label: string): string {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return `e2e+${safeLabel}-${nonce}@gocast.test`
}

export function createE2EUser({
  email,
  name = "E2E User",
  password = E2E_PASSWORD,
  verified = true,
  code = EMAIL_CODE,
}: UserOptions): void {
  artisan([
    "user",
    `--email=${email}`,
    `--name=${name}`,
    `--password=${password}`,
    `--code=${code}`,
    ...(verified ? [] : ["--unverified"]),
  ])
}

export function setEmailCode(email: string, code = EMAIL_CODE): void {
  artisan(["email-code", `--email=${email}`, `--code=${code}`])
}

export function setPasswordResetCode(email: string, code = RESET_CODE): void {
  artisan(["password-code", `--email=${email}`, `--code=${code}`])
}

export async function isolateAuthRateLimit(context: BrowserContext, testInfo: TestInfo): Promise<void> {
  const seedInput = `${testInfo.file}:${testInfo.title}:${testInfo.retry}:${testInfo.repeatEachIndex}`
  const seed = [...seedInput].reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0
  }, 0)
  const third = (seed % 200) + 1
  const fourth = (Math.floor(seed / 200) % 250) + 1

  await context.setExtraHTTPHeaders({
    "X-Forwarded-For": `198.51.${third}.${fourth}`,
  })
}

export async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto("/auth/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

export async function expectDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/dashboard\/stations/, { timeout: 20_000 })
  await expect(
    page.getByText("Create your first station").or(page.getByRole("heading", { name: "Your stations" })),
  ).toBeVisible({ timeout: 20_000 })
}

export async function signOutFromDashboard(page: Page, name = "E2E User"): Promise<void> {
  await page.getByRole("button", { name: new RegExp(name, "i") }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL("/", { timeout: 20_000 })
}

function artisan(args: string[]): string {
  return execFileSync("php8.4", ["artisan", "e2e:auth", ...args], {
    cwd: apiRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}
