import { expect, test } from "@playwright/test"
import {
  E2E_PASSWORD,
  EMAIL_CODE,
  RESET_CODE,
  createE2EUser,
  expectDashboard,
  isolateAuthRateLimit,
  setEmailCode,
  setPasswordResetCode,
  signIn,
  signOutFromDashboard,
  uniqueEmail,
} from "./support/auth"

test.describe("auth e2e", () => {
  test.beforeEach(async ({ context }, testInfo) => {
    await isolateAuthRateLimit(context, testInfo)
  })

  test("logged-out visitors are redirected away from protected dashboard routes", async ({ page }) => {
    for (const route of ["/dashboard", "/dashboard/stations", "/dashboard/broadcasts", "/dashboard/settings"]) {
      await page.goto(route)

      await expect(page).toHaveURL(/\/auth\/login/)
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
    }
  })

  test("invalid credentials stay on login and show an error", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid credentials" }),
      })
    })

    await signIn(page, "nobody@example.test", "definitely-wrong")

    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByText(/Invalid credentials|Something went wrong/i)).toBeVisible()
  })

  test("verified users can sign in, are redirected away from auth pages, and can sign out", async ({ page }) => {
    const email = uniqueEmail("login")
    createE2EUser({ email, name: "E2E Login" })

    await signIn(page, email)
    await expectDashboard(page)

    await page.goto("/auth/login")
    await expectDashboard(page)

    await signOutFromDashboard(page, "E2E Login")

    await page.goto("/dashboard/stations")
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test("unverified users are blocked from the dashboard until they verify their email", async ({ page }) => {
    const email = uniqueEmail("unverified")
    createE2EUser({ email, name: "E2E Pending", verified: false })

    await signIn(page, email)

    await expect(page.getByRole("dialog", { name: "Verify your email" })).toBeVisible()
    await page.goto("/dashboard/stations")
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByRole("dialog", { name: "Verify your email" })).toBeVisible()

    await page.getByLabel("Verification code").fill("000000")
    await page.getByRole("button", { name: "Verify email" }).click()
    await expect(page.getByText("Invalid code.")).toBeVisible({ timeout: 15_000 })

    setEmailCode(email, EMAIL_CODE)
    await page.getByLabel("Verification code").fill(EMAIL_CODE)
    await page.getByRole("button", { name: "Verify email" }).click()

    await expectDashboard(page)
  })

  test("new users can register, verify email, and reach the dashboard", async ({ page }) => {
    const email = uniqueEmail("register")

    await page.goto("/auth/register")
    await page.getByLabel("Name").fill("E2E Register")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD)
    await page.getByLabel("Confirm password").fill(E2E_PASSWORD)
    await page.getByRole("button", { name: "Sign up" }).click()

    await expect(page.getByRole("dialog", { name: "Verify your email" })).toBeVisible()

    setEmailCode(email, EMAIL_CODE)
    await page.getByLabel("Verification code").fill(EMAIL_CODE)
    await page.getByRole("button", { name: "Verify email" }).click()

    await expectDashboard(page)
  })

  test("password reset consumes a code and allows login with the new password", async ({ page }) => {
    const email = uniqueEmail("reset")
    const newPassword = "NewPassword123!"
    createE2EUser({ email, name: "E2E Reset" })

    await page.goto("/auth/forgot")
    await page.getByLabel("Email").fill(email)
    await page.getByRole("button", { name: "Send reset code" }).click()
    await expect(page.getByText("Enter your reset code")).toBeVisible()

    setPasswordResetCode(email, RESET_CODE)
    await page.getByLabel("Verification code").fill(RESET_CODE)
    await page.getByLabel("New password", { exact: true }).fill(newPassword)
    await page.getByLabel("Confirm new password").fill(newPassword)
    await page.getByRole("button", { name: "Reset password" }).click()

    await expect(page).toHaveURL(/\/auth\/login/)

    await signIn(page, email, E2E_PASSWORD)
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible()

    await signIn(page, email, newPassword)
    await expectDashboard(page)
  })

  test("settings can change the account email and require verification of the new address", async ({ page }) => {
    const email = uniqueEmail("profile")
    const newEmail = uniqueEmail("profile-new")
    createE2EUser({ email, name: "E2E Profile" })

    await signIn(page, email)
    await expectDashboard(page)

    await page.goto("/dashboard/settings")
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
    await page.locator("#email").fill(newEmail)
    await page.locator("#profile-current-password").fill(E2E_PASSWORD)
    await page.getByRole("button", { name: "Save changes" }).click()

    await expect(page.getByRole("dialog", { name: "Verify your email" })).toBeVisible()

    setEmailCode(newEmail, EMAIL_CODE)
    await page.getByLabel("Verification code").fill(EMAIL_CODE)
    await page.getByRole("button", { name: "Verify email" }).click()

    await expectDashboard(page)
  })

  test("after signing out, Back returns to the homepage and a refresh doesn't repeat the notice", async ({ page }) => {
    const email = uniqueEmail("back")
    createE2EUser({ email, name: "E2E Back" })
    await signIn(page, email)
    await expectDashboard(page)
    await signOutFromDashboard(page, "E2E Back")
    await expect(page).toHaveURL("/")

    // In-app forward, then Back: the entry the notice strip rewrote must still
    // be Next's, or the address bar says / while /help stays on screen.
    await page.getByRole("link", { name: "Help", exact: true }).first().click()
    await expect(page).toHaveURL(/\/help$/)
    await page.goBack()
    await expect(page).toHaveURL("/")
    await expect(page.getByRole("heading", { level: 1, name: "Your voice. On air in 60 seconds." })).toBeVisible()

    await page.reload()
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(page.getByText("Signed out")).toHaveCount(0)
    expect(new URL(page.url()).search).toBe("")
  })

  test("'Use a different account' from the email change signs out to sign-in in one load", async ({ page }) => {
    const email = uniqueEmail("profile-leave")
    createE2EUser({ email, name: "E2E Leave" })
    const crashes: string[] = []
    page.on("pageerror", (e) => crashes.push(e.message.slice(0, 200)))

    await signIn(page, email)
    await expectDashboard(page)

    await page.goto("/dashboard/settings")
    await page.getByRole("textbox", { name: "Email" }).fill(uniqueEmail("profile-leave-new"))
    await page.getByRole("textbox", { name: "Current password" }).first().fill(E2E_PASSWORD)
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("dialog", { name: "Verify your email" })).toBeVisible()

    await page.getByRole("button", { name: "Use a different account" }).click()
    // Plain sign-in, not the "session expired" one the revoked token's 401s
    // used to trigger on the way out.
    await expect(page).toHaveURL(/\/auth\/login$/, { timeout: 20_000 })
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
    await expect(page.getByText("Signed out")).toBeVisible()
    expect(crashes).toEqual([])
  })

  test("settings can change password and the new password works on the next login", async ({ page }) => {
    const email = uniqueEmail("change-password")
    const newPassword = "ChangedPassword123!"
    createE2EUser({ email, name: "E2E Password" })

    await signIn(page, email)
    await expectDashboard(page)

    await page.goto("/dashboard/settings")
    await page.locator("#current-password").fill(E2E_PASSWORD)
    await page.locator("#new-password").fill(newPassword)
    await page.locator("#new-password-confirmation").fill(newPassword)
    await page.getByRole("button", { name: "Update password" }).click()
    await expect(page.getByText("Password changed")).toBeVisible()

    await signOutFromDashboard(page, "E2E Password")
    await signIn(page, email, newPassword)

    await expectDashboard(page)
  })

  test("users can delete their account and the old credentials stop working", async ({ page }) => {
    const email = uniqueEmail("delete")
    createE2EUser({ email, name: "E2E Delete" })

    await signIn(page, email)
    await expectDashboard(page)

    const crashes: string[] = []
    page.on("pageerror", (e) => crashes.push(e.message.slice(0, 200)))
    await page.goto("/dashboard/settings")
    await page.getByRole("button", { name: /Delete account/ }).click()
    const dialog = page.getByRole("dialog", { name: "Delete your account?" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("textbox").fill(email)
    await dialog.getByRole("button", { name: "Delete forever" }).click()

    // One full-page load home, not the "session expired" redirect the
    // deleted token's 401s would trigger.
    await expect(page).toHaveURL("/", { timeout: 20_000 })
    await expect(page.getByText("Account deleted — sorry to see you go.")).toBeVisible()
    expect(crashes).toEqual([])

    await signIn(page, email)
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible()
  })

  test("google auth actions open the backend OAuth endpoint and surface popup failures", async ({ page }) => {
    await page.addInitScript(() => {
      const openedUrls: string[] = []

      Object.defineProperty(window, "__googleOpenUrls", {
        value: openedUrls,
      })

      window.open = ((url?: string | URL) => {
        openedUrls.push(String(url))

        return null
      }) as typeof window.open
    })

    await page.goto("/auth/login")
    await page.getByRole("button", { name: "Continue with Google" }).click()

    await expect(page.getByText("Popup blocked. Enable popups and try again.")).toBeVisible()
    await expect.poll(() => page.evaluate(() => ((window as typeof window & { __googleOpenUrls: string[] }).__googleOpenUrls[0]))).toContain("/auth/google")
  })
})
