import { test, expect } from "@playwright/test"
import { E2E_PASSWORD } from "./support/auth"

/**
 * The dashboard with no station yet. Uses the create@gocast.test keeper
 * (Free, no station), which it never changes: nothing here presses Create.
 */
test.describe("no station yet", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login")
    await page.getByLabel("Email").fill("create@gocast.test")
    await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
  })

  test("the sidebar explains instead of navigating", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole("heading", { name: "Let’s set up your station." })).toBeVisible()

    for (const name of ["Studio", "Library", "Audience", "Your shows", "Settings"]) {
      await page.getByRole("navigation", { name: "Station" }).getByRole("link", { name }).click()
      await expect(page).toHaveURL(/\/dashboard$/)
    }
    await expect(page.getByText("Create your station first. Everything here belongs to it.")).toBeVisible()
    // One toast, however many clicks.
    await expect(page.getByText("Create your station first", { exact: false })).toHaveCount(1)
  })

  test("Request Pro explains instead of opening the form", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole("button", { name: "Request Pro" }).click()
    await expect(page.getByText("Create your station first, then tell us about it to request Pro.")).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("the link previews from the name", async ({ page }) => {
    await page.getByLabel("Station name").fill("Night Owl Radio")
    await expect(page.getByText("night-owl-radio", { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("button", { name: "Create Night Owl Radio" })).toBeEnabled()
  })
})
