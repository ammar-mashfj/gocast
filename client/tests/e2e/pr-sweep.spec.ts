import fs from "node:fs"
import path from "node:path"
import { test, expect, type Browser, type Page } from "@playwright/test"
import { E2E_PASSWORD } from "./support/auth"

/**
 * The pre-merge sweep (playwright.sweep.config.ts): every page and its main
 * states on each screen the config lists. For each one it saves a full-page
 * PNG and a line in results.jsonl with what a screenshot can't show:
 *
 *   - uncaught page errors and console errors;
 *   - API responses of 400 and up, and requests that never finished;
 *   - sideways overflow, with the elements that stick out;
 *   - how far the page scrolls down (0 = fits the screen).
 *
 * Fails only on page errors, 5xx, sideways scroll, and a page that didn't
 * draw. The rest is for reading. Uses the e2e:seed keeper accounts and never
 * changes them.
 */

const OUT = path.resolve(process.cwd(), "tests/e2e/.sweep")

const ACCOUNTS = {
  pro: { email: "shell@gocast.test", station: "night-shift-shell" },
  free: { email: "free@gocast.test", station: "free-shell" },
  new: { email: "create@gocast.test", station: null },
  anon: { email: null, station: null },
} as const
type Account = keyof typeof ACCOUNTS

interface Shot {
  name: string
  path: string
  station?: boolean
  open?: (page: Page) => Promise<void>
  expects?: "heading" | "dialog" | "body"
  /** The page is meant to fit the screen without scrolling. */
  scrollFree?: boolean
}

function click(name: string | RegExp, opts: { last?: boolean } = {}) {
  return async (page: Page) => {
    const buttons = page.getByRole("button", { name, exact: typeof name === "string" })
    await (opts.last ? buttons.last() : buttons.first()).click()
  }
}

const SHOTS: Record<Account, Shot[]> = {
  pro: [
    { name: "stations-list", path: "/dashboard/stations" },
    { name: "overview", path: "", station: true },
    { name: "overview-share", path: "", station: true, open: click("QR code & embed"), expects: "dialog" },
    { name: "overview-edit-station", path: "", station: true, open: click(/^Edit profile/), expects: "dialog" },
    { name: "golive-preflight", path: "/live", station: true, scrollFree: true },
    { name: "library", path: "/library", station: true },
    {
      name: "library-row-selected",
      path: "/library",
      station: true,
      open: async (page) => {
        await page.getByRole("checkbox").nth(1).check()
      },
    },
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
    { name: "dashboard-404", path: "/dashboard/stations/no-such-station-xyz", expects: "body" },
  ],
  free: [
    { name: "free-overview", path: "", station: true },
    { name: "free-golive-preflight", path: "/live", station: true, scrollFree: true },
    { name: "free-library", path: "/library", station: true },
    { name: "free-playlists", path: "/playlists", station: true },
    { name: "free-jingles", path: "/jingles", station: true },
    { name: "free-schedule", path: "/schedule", station: true },
    { name: "free-audience", path: "/audience", station: true },
    { name: "free-your-shows-empty", path: "/dashboard/broadcasts" },
    { name: "free-settings-dj-locked", path: "/settings", station: true, open: click(/Use your own DJ software/) },
    { name: "free-account", path: "/dashboard/settings" },
    { name: "free-request-pro", path: "/dashboard/settings", open: click("Get Pro", { last: true }), expects: "dialog" },
  ],
  new: [
    { name: "create-station", path: "/dashboard" },
    {
      name: "create-station-filled",
      path: "/dashboard",
      open: async (page) => {
        await page.getByLabel("Station name").fill("Night Owl Radio")
        await page.getByRole("button", { name: "Jazz" }).click()
        await page.getByLabel("Description").fill("Late-night soul, jazz and slow-burn electronica for the insomniacs.")
        await expect(page.getByText("night-owl-radio", { exact: true }).first()).toBeVisible({ timeout: 10_000 })
      },
    },
  ],
  anon: [
    { name: "home", path: "/" },
    { name: "login", path: "/auth/login" },
    { name: "register", path: "/auth/register" },
    { name: "forgot", path: "/auth/forgot" },
    { name: "help", path: "/help" },
    { name: "help-article-studio", path: "/help/using-the-studio" },
    { name: "help-article-schedule", path: "/help/schedule-playlists-by-time" },
    { name: "blog", path: "/blog" },
    { name: "blog-article", path: "/blog/how-to-schedule-playlists-on-your-radio-station" },
    { name: "discover", path: "/discover", expects: "body" },
    { name: "terms", path: "/terms" },
    { name: "player-page", path: "/station/night-shift-radio", expects: "body" },
    { name: "embed-pro", path: "/embed/night-shift-radio", expects: "body" },
    { name: "embed-free-404", path: "/embed/free-shell", expects: "body" },
    { name: "site-404", path: "/no-such-page-xyz", expects: "body" },
  ],
}

function urlFor(account: Account, shot: Shot): string {
  const station = ACCOUNTS[account].station
  return shot.station && station ? `/dashboard/stations/${station}${shot.path}` : shot.path
}

async function signInState(browser: Browser, baseURL: string, account: Account, file: string) {
  const { email } = ACCOUNTS[account]
  if (!email) return
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 20 * 60_000
  if (fresh) return
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "X-Forwarded-For": `198.51.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 250) + 1}` },
  })
  const page = await context.newPage()
  await page.goto("/auth/login")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  await context.storageState({ path: file })
  await context.close()
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      [...document.images].filter((i) => i.loading !== "lazy").map((i) =>
        i.complete ? null : new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }) }),
      ),
    ),
  )
  await expect(page.getByText("Checking…")).toHaveCount(0, { timeout: 15_000 })
  await page.waitForTimeout(700)
}

/** Visible elements that stick out past the right edge and aren't inside a scroller or clipper that stays on screen. */
async function overflowOffenders(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const out: string[] = []
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.position === "fixed" && r.left >= vw) continue
      let clipped = false
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox !== "visible" && a.getBoundingClientRect().right <= vw + 1) { clipped = true; break }
      }
      if (clipped) continue
      // Only report the outermost offender of a subtree.
      if (el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1 && el.parentElement !== document.body) continue
      const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".")
      out.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(r.right)} "${(el.innerText ?? "").trim().slice(0, 40)}"`)
      if (out.length >= 6) break
    }
    return out
  })
}

for (const [account, shots] of Object.entries(SHOTS) as [Account, Shot[]][]) {
  test.describe(`${account} @sweep`, () => {
    test.describe.configure({ mode: "parallel" })

    for (const shot of shots) {
      test(shot.name, async ({ browser }, testInfo) => {
        const device = testInfo.project.name
        const baseURL = testInfo.project.use.baseURL as string
        const stateFile = path.join(OUT, `.auth-${account}-${device}.json`)
        fs.mkdirSync(OUT, { recursive: true })
        await signInState(browser, baseURL, account, stateFile)

        const context = await browser.newContext({
          ...testInfo.project.use,
          baseURL,
          storageState: ACCOUNTS[account].email ? stateFile : { cookies: [], origins: [] },
        })
        const page = await context.newPage()
        const pageErrors: string[] = []
        const consoleErrors: string[] = []
        const badResponses: string[] = []
        const failedRequests: string[] = []
        page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)))
        page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)) })
        page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`) })
        page.on("requestfailed", (r) => {
          const f = r.failure()?.errorText ?? ""
          if (!/ERR_ABORTED/.test(f)) failedRequests.push(`${f} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`)
        })
        // Headless tabs report hidden, which pauses the status poll and the player.
        await page.addInitScript(() => {
          Object.defineProperty(document, "visibilityState", { get: () => "visible" })
          Object.defineProperty(document, "hidden", { get: () => false })
        })

        let drew = true
        try {
          await page.goto(urlFor(account, shot))
          await settle(page)
          if (shot.open) {
            await shot.open(page)
            await page.waitForTimeout(500)
          }
          const expects = shot.expects ?? "heading"
          if (expects === "dialog") await expect(page.getByRole("dialog")).toBeVisible()
          else if (expects === "heading") await expect(page.locator("h1").first()).toBeVisible()
        } catch (e) {
          drew = false
          pageErrors.push(`DID NOT DRAW: ${(e as Error).message.split("\n")[0]}`)
        }

        const m = await page.evaluate(() => ({
          url: location.pathname + location.search,
          sideways: document.documentElement.scrollWidth - window.innerWidth,
          down: document.documentElement.scrollHeight - window.innerHeight,
          h1: document.querySelector("h1")?.textContent?.trim().slice(0, 60) ?? null,
        }))
        const offenders = await overflowOffenders(page)

        const file = path.join(OUT, device, `${account}-${shot.name}.png`)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        await page.screenshot({ path: file, fullPage: shot.expects !== "dialog" })

        const row = { device, account, shot: shot.name, ...m, offenders, pageErrors, consoleErrors, badResponses, failedRequests, scrollFree: !!shot.scrollFree }
        fs.appendFileSync(path.join(OUT, "results.jsonl"), JSON.stringify(row) + "\n")
        await context.close()

        expect(drew, pageErrors.join("\n")).toBe(true)
        expect(pageErrors, "uncaught page errors").toEqual([])
        expect(badResponses.filter((r) => r.startsWith("5")), "server errors").toEqual([])
        expect(m.sideways, `scrolls sideways: ${offenders.join(" | ")}`).toBeLessThanOrEqual(0)
        if (shot.scrollFree) expect(m.down, "meant to fit the screen but scrolls down").toBeLessThanOrEqual(0)
      })
    }
  })
}
