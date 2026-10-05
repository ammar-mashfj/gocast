import fs from "node:fs"
import path from "node:path"
import { test, expect, type Page } from "@playwright/test"
import { E2E_PASSWORD } from "./support/auth"

/**
 * Every dashboard page and its main states, at desktop and phone width: a
 * full-page PNG of each, plus the checks a screenshot alone can't make.
 *
 *   - no uncaught page error;
 *   - the page's heading is there (or, for a dialog state, the dialog);
 *   - on a phone, nothing scrolls sideways.
 *
 * NOT a pixel-diff suite. The pages show live data — the station clock,
 * "today" on charts, listener counts — so a baseline would go stale by the
 * hour. The PNGs are for looking at (or diffing two runs by eye); the
 * assertions are what fail.
 *
 * Runs against Ammar's dev servers (never starts its own) and three keeper
 * accounts, which it reads and never changes:
 *
 *   shell@gocast.test  Pro, station night-shift-shell, with tracks,
 *                      playlists, a slot, seeded shows and listeners
 *   free@gocast.test   Free, station free-shell (the locked states)
 *   create@gocast.test Free, no station (the create page)
 *
 * All use E2E_PASSWORD. See docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md (R6.3) for
 * how they were made.
 *
 *   npm run test:visual   (E2E_CAPTURE=1 lifts the config's grepInvert)
 *   → tests/e2e/.visual/{desktop,phone}/*.png
 */

const OUT = path.resolve(process.cwd(), "tests/e2e/.visual")

const ACCOUNTS = {
  pro: { email: "shell@gocast.test", station: "night-shift-shell" },
  free: { email: "free@gocast.test", station: "free-shell" },
  new: { email: "create@gocast.test", station: null },
} as const
type Account = keyof typeof ACCOUNTS

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const

interface Shot {
  name: string
  /** Under the account's station when it starts with "/" and `station` is true. */
  path: string
  station?: boolean
  /** Opens the state to capture: a dialog, a fold, an expanded row. */
  open?: (page: Page) => Promise<void>
  /** What proves the page drew: its h1 by default, the dialog for dialog states. */
  expects?: "heading" | "dialog"
}

const SHOTS: Record<Account, Shot[]> = {
  pro: [
    { name: "overview", path: "", station: true },
    { name: "overview-share", path: "", station: true, open: click("Share…"), expects: "dialog" },
    { name: "overview-edit-station", path: "", station: true, open: click("Edit profile"), expects: "dialog" },
    { name: "studio-preflight", path: "/live", station: true },
    { name: "autodj", path: "/library", station: true },
    { name: "playlists", path: "/playlists", station: true },
    { name: "jingles", path: "/jingles", station: true },
    { name: "schedule", path: "/schedule", station: true },
    { name: "schedule-new-slot", path: "/schedule", station: true, open: click("Add slot"), expects: "dialog" },
    { name: "audience-90d", path: "/audience", station: true },
    { name: "audience-7d", path: "/audience?days=7", station: true },
    { name: "your-shows", path: "/dashboard/broadcasts" },
    {
      name: "your-shows-row-open",
      path: "/dashboard/broadcasts",
      open: async (page) => page.locator("li button[aria-expanded]").nth(1).click(),
    },
    { name: "settings", path: "/settings", station: true },
    { name: "settings-dj-software", path: "/settings", station: true, open: click(/Use your own DJ software/) },
    { name: "settings-delete-confirm", path: "/settings", station: true, open: click("Delete station…"), expects: "dialog" },
    { name: "account", path: "/dashboard/settings" },
    { name: "account-delete-confirm", path: "/dashboard/settings", open: click("Delete account…"), expects: "dialog" },
    { name: "design-system", path: "/dashboard/design-system" },
  ],
  free: [
    { name: "free-overview", path: "", station: true },
    { name: "free-autodj", path: "/library", station: true },
    { name: "free-playlists", path: "/playlists", station: true },
    { name: "free-jingles", path: "/jingles", station: true },
    { name: "free-schedule", path: "/schedule", station: true },
    { name: "free-audience", path: "/audience", station: true },
    { name: "free-your-shows-empty", path: "/dashboard/broadcasts" },
    { name: "free-settings-dj-locked", path: "/settings", station: true, open: click(/Use your own DJ software/) },
    { name: "free-account", path: "/dashboard/settings" },
    { name: "free-request-pro", path: "/dashboard/settings", open: click("Request Pro", { last: true }), expects: "dialog" },
  ],
  new: [{ name: "create-station", path: "/dashboard" }],
}

function click(name: string | RegExp, opts: { last?: boolean } = {}) {
  return async (page: Page) => {
    const buttons = page.getByRole("button", { name, exact: typeof name === "string" })
    await (opts.last ? buttons.last() : buttons.first()).click()
  }
}

function urlFor(account: Account, shot: Shot): string {
  const station = ACCOUNTS[account].station
  return shot.station && station ? `/dashboard/stations/${station}${shot.path}` : shot.path
}

/** Webfonts swapped, images loaded, the status poll past "Checking…". */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((i) => (i.complete ? null : new Promise((r) => i.addEventListener("load", r, { once: true })))),
    ),
  )
  await expect(page.getByText("Checking…")).toHaveCount(0, { timeout: 15_000 })
  await page.waitForTimeout(500)
}

for (const [account, shots] of Object.entries(SHOTS) as [Account, Shot[]][]) {
  test.describe(`${account} account @visual`, () => {
    const state = path.join(OUT, `.auth-${account}.json`)

    // One sign-in per account, reused by every shot.
    test.beforeAll(async ({ browser }, testInfo) => {
      fs.mkdirSync(OUT, { recursive: true })
      // Its own empty state: test.use below would hand it the file it is about to write.
      const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } })
      await page.goto("/auth/login")
      await page.getByLabel("Email").fill(ACCOUNTS[account].email)
      await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD)
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
      await page.context().storageState({ path: state })
      await page.close()
    })

    test.use({ storageState: state })

    for (const [viewport, size] of Object.entries(VIEWPORTS)) {
      for (const shot of shots) {
        test(`${shot.name} · ${viewport}`, async ({ page }) => {
          const errors: string[] = []
          page.on("pageerror", (e) => errors.push(e.message))
          // Headless tabs report hidden, which pauses the status poll and the
          // player; the dashboard would sit on "Checking…".
          await page.addInitScript(() => {
            Object.defineProperty(document, "visibilityState", { get: () => "visible" })
            Object.defineProperty(document, "hidden", { get: () => false })
          })
          await page.setViewportSize(size)

          await page.goto(urlFor(account, shot))
          await settle(page)
          if (shot.open) {
            await shot.open(page)
            await page.waitForTimeout(400)
          }

          if ((shot.expects ?? "heading") === "dialog") {
            await expect(page.getByRole("dialog")).toBeVisible()
          } else {
            await expect(page.locator("h1").first()).toBeVisible()
          }

          if (viewport === "phone") {
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
            expect(overflow, "the page scrolls sideways on a phone").toBeLessThanOrEqual(0)
          }

          const file = path.join(OUT, viewport, `${shot.name}.png`)
          fs.mkdirSync(path.dirname(file), { recursive: true })
          await page.screenshot({ path: file, fullPage: !shot.open || shot.expects !== "dialog" })

          expect(errors, "uncaught page errors").toEqual([])
        })
      }
    }
  })
}
