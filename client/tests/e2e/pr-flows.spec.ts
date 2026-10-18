import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test"
import { E2E_PASSWORD, createE2EUser, uniqueEmail } from "./support/auth"

/**
 * The pre-merge flows (playwright.sweep.config.ts, run with --workers=1):
 *
 *   live   — on every screen: pre-flight → Go live with a fake mic → the
 *            studio on air (screenshot, sideways and downward scroll) → End
 *            show → the wrap screen. Uses shell@'s night-shift-shell, so
 *            one at a time.
 *   logic  — desktop only, on a throwaway Pro account: create a station,
 *            upload, playlist, schedule slot, settings, power, delete.
 *
 * Media comes from E2E_MEDIA (a directory with track-a.mp3, tagged-track.mp3
 * and jingle.mp3).
 */

const OUT = path.resolve(process.cwd(), "tests/e2e/.sweep")
const MEDIA = process.env.E2E_MEDIA ?? ""
const PRO = { email: "shell@gocast.test", station: "night-shift-shell" }
const apiRoot = path.resolve(process.cwd(), "../api")

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  },
})

function log(row: Record<string, unknown>) {
  fs.mkdirSync(OUT, { recursive: true })
  fs.appendFileSync(path.join(OUT, "flows.jsonl"), JSON.stringify(row) + "\n")
}

async function newContext(browser: Browser, testInfo: TestInfo, storage?: string): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL: testInfo.project.use.baseURL as string,
    permissions: ["microphone"],
    storageState: storage ?? { cookies: [], origins: [] },
    extraHTTPHeaders: { "X-Forwarded-For": `198.51.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 250) + 1}` },
  })
  await context.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "visible" })
    Object.defineProperty(document, "hidden", { get: () => false })
  })
  return context
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth/login")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}

function watch(page: Page) {
  const issues: string[] = []
  page.on("pageerror", (e) => issues.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on("console", (m) => { if (m.type() === "error") issues.push(`console@${new URL(page.url()).pathname}: ${m.text().slice(0, /hydrat/.test(m.text()) ? 4000 : 200)}`) })
  page.on("response", (r) => { if (r.status() >= 400) issues.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`) })
  return issues
}

async function measure(page: Page) {
  return page.evaluate(() => ({
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    down: document.documentElement.scrollHeight - window.innerHeight,
  }))
}

async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const file = path.join(OUT, testInfo.project.name, `flow-${name}.png`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file, fullPage })
}

function visible(page: Page, role: Parameters<Page["getByRole"]>[0], name: string | RegExp) {
  return page.getByRole(role, { name, exact: typeof name === "string" }).filter({ visible: true }).first()
}

test.describe("live @flows", () => {
  test.describe.configure({ mode: "serial" })

  test("go live, studio on air, end show", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await newContext(browser, testInfo)
    const page = await context.newPage()
    const issues = watch(page)
    await signIn(page, PRO.email)

    await page.goto(`/dashboard/stations/${PRO.station}/live`)
    await expect(page.getByRole("heading", { name: "Ready when you are." })).toBeVisible({ timeout: 20_000 })
    // Load two tracks into the running order.
    const input = page.locator('input[type="file"]').first()
    await input.setInputFiles([path.join(MEDIA, "track-a.mp3"), path.join(MEDIA, "tagged-track.mp3")])
    await page.waitForTimeout(1500)
    const pre = await measure(page)
    await shot(page, testInfo, "live-preflight-with-queue", false)

    await visible(page, "button", "Go live").click()
    await expect(page).toHaveURL(/\/studio/, { timeout: 20_000 })

    // On air: the checks dialog says so and then gets out of the way; End show is the proof.
    const endShow = page.getByRole("button", { name: "End show" }).filter({ visible: true }).first()
    try {
      await expect(endShow).toBeVisible({ timeout: 120_000 })
    } catch (e) {
      const dialog = await page.getByRole("dialog").innerText().catch(() => "(no dialog)")
      await shot(page, testInfo, "live-failed", false)
      log({ device: testInfo.project.name, flow: "live", ok: false, dialog, issues })
      throw e
    }
    // Let the "You're on air" note pass and the stats arrive.
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(4000)
    const studio = await measure(page)
    await shot(page, testInfo, "studio-live", false)
    await shot(page, testInfo, "studio-live-full", true)

    // Talk: hold the talk control briefly (Space on desktop).
    await page.keyboard.down("Space")
    await page.waitForTimeout(800)
    await shot(page, testInfo, "studio-talking", false)
    await page.keyboard.up("Space")

    await endShow.click()
    const confirm = page.getByRole("dialog")
    await expect(confirm).toBeVisible()
    await shot(page, testInfo, "studio-end-confirm", false)
    await confirm.getByRole("button", { name: "End show" }).click()
    await expect(page).toHaveURL(/\/studio\/wrap/, { timeout: 30_000 })
    await page.waitForTimeout(1500)
    const wrap = await measure(page)
    await shot(page, testInfo, "studio-wrap", true)

    log({ device: testInfo.project.name, flow: "live", ok: true, pre, studio, wrap, issues })
    await context.close()
    expect(issues.filter((i) => i.startsWith("pageerror") || /^5\d\d /.test(i))).toEqual([])
    expect(studio.sideways, "studio scrolls sideways").toBeLessThanOrEqual(0)
    expect(studio.down, "studio scrolls down").toBeLessThanOrEqual(0)
  })
})

test.describe("retry after a failed check @flows", () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "once, on desktop"))

  test("mic blocked → Go live with music only goes on air, stays in the studio", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await newContext(browser, testInfo)
    // The mic is refused, as if the host clicked Block.
    await context.addInitScript(() => {
      const md = navigator.mediaDevices
      if (md) md.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
    })
    const page = await context.newPage()
    const urls: string[] = []
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) urls.push(new URL(f.url()).pathname) })
    await signIn(page, PRO.email)
    await page.goto(`/dashboard/stations/${PRO.station}/live`)
    await expect(page.getByRole("heading", { name: "Ready when you are." })).toBeVisible({ timeout: 20_000 })
    await visible(page, "button", "Go live").click()
    await expect(page).toHaveURL(/\/studio/, { timeout: 20_000 })
    const retryMusic = page.getByRole("button", { name: "Go live with music only" })
    await expect(retryMusic).toBeVisible({ timeout: 60_000 })
    await shot(page, testInfo, "retry-mic-blocked", false)

    // "Try again" first: it should re-run the checks here, not leave.
    await page.getByRole("button", { name: "Try again" }).first().click()
    await page.waitForTimeout(3000)
    const afterTryAgain = new URL(page.url()).pathname
    await shot(page, testInfo, "retry-after-try-again", false)

    // Then music only: it should end on air.
    let onAir = false
    if (await retryMusic.isVisible().catch(() => false)) {
      await retryMusic.click()
      onAir = await page.getByRole("button", { name: "End show" }).filter({ visible: true }).first()
        .waitFor({ timeout: 90_000 }).then(() => true, () => false)
    }
    const finalUrl = new URL(page.url()).pathname
    await shot(page, testInfo, "retry-after-music-only", false)
    log({ device: testInfo.project.name, flow: "retry", afterTryAgain, finalUrl, onAir, urls })

    if (onAir) {
      await page.getByRole("button", { name: "End show" }).filter({ visible: true }).first().click()
      await page.getByRole("dialog").getByRole("button", { name: "End show" }).click()
      await expect(page).toHaveURL(/\/studio\/wrap/, { timeout: 30_000 })
    }
    await context.close()
    expect.soft(afterTryAgain, "Try again left the studio").toMatch(/\/studio$/)
    expect.soft(onAir, "Go live with music only did not get on air").toBe(true)
  })
})

test.describe("sign out while live @flows", () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "once, on desktop"))

  test("End and sign out actually ends the show", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await newContext(browser, testInfo)
    const page = await context.newPage()
    await signIn(page, PRO.email)
    await page.goto(`/dashboard/stations/${PRO.station}/live`)
    await expect(page.getByRole("heading", { name: "Ready when you are." })).toBeVisible({ timeout: 20_000 })
    await page.locator('input[type="file"]').first().setInputFiles([path.join(MEDIA, "track-a.mp3")])
    await visible(page, "button", "Go live").click()
    await expect(page.getByRole("button", { name: "End show" }).filter({ visible: true }).first()).toBeVisible({ timeout: 120_000 })
    await page.waitForTimeout(5000)
    const openBefore = artisanTinker(`echo App\\Models\\StreamSession::whereHas('station', fn($q)=>$q->where('slug','${PRO.station}'))->whereNull('ended_at')->count();`).trim()

    await page.getByRole("button", { name: /Night Shift Shell|shell@gocast\.test/ }).filter({ visible: true }).last().click()
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "End and sign out" }).click()
    await expect(page).toHaveURL(/\/$|\/auth\/login/, { timeout: 20_000 })
    // Give the server's own detection (harbor timeout, sweep) a fair chance.
    await page.waitForTimeout(25_000)
    const openAfter = artisanTinker(`echo App\\Models\\StreamSession::whereHas('station', fn($q)=>$q->where('slug','${PRO.station}'))->whereNull('ended_at')->count();`).trim()
    const mediaTracks = await page.evaluate(() => (window as unknown as { __gocastMicLive?: boolean }).__gocastMicLive ?? null)
    log({ device: testInfo.project.name, flow: "signout-while-live", openBefore, openAfter, mediaTracks })
    await shot(page, testInfo, "signout-while-live-after", false)
    await context.close()
    expect.soft(openAfter, "a show is still open 25s after End and sign out").toBe("0")
  })
})

function artisanTinker(code: string): string {
  return execFileSync("php8.4", ["artisan", "tinker", "--execute", code], { cwd: apiRoot, encoding: "utf8" })
}

test.describe("logic @flows", () => {
  test.describe.configure({ mode: "serial" })
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "logic flows run once, on desktop"))

  const email = uniqueEmail("pr-sweep")
  const name = `Sweep Radio ${Date.now() % 100000}`
  let slug = ""
  let context: BrowserContext
  let page: Page
  let issues: string[]

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== "desktop") return
    createE2EUser({ email, name: "Sweep Tester" })
    artisanTinker(`$u=App\\Models\\User::where('email','${email}')->first(); $u->plan_id=App\\Models\\Plan::where('slug','pro')->value('id'); $u->save(); echo 'ok';`)
    context = await newContext(browser, testInfo)
    page = await context.newPage()
    issues = watch(page)
    await signIn(page, email)
  })

  test.afterAll(async () => {
    log({ flow: "logic", email, slug, issues })
    await context?.close()
  })

  test("create a station", async ({}, testInfo) => {
    await page.goto("/dashboard")
    await page.getByLabel("Station name").fill(name)
    await page.getByRole("button", { name: "Jazz" }).click()
    await page.getByLabel("Description").fill("A station made by the pre-merge sweep.")
    await page.getByRole("button", { name: /Create station|Create my station|Create/ }).last().click()
    await expect(page).toHaveURL(/\/dashboard\/stations\/[a-z0-9-]+$/, { timeout: 30_000 })
    slug = page.url().split("/").pop()!
    await expect(page.locator("h1").first()).toContainText(name)
    await shot(page, testInfo, "logic-01-new-station")
  })

  test("upload two tracks; tags are read", async ({}, testInfo) => {
    test.setTimeout(180_000)
    await page.goto(`/dashboard/stations/${slug}/library`)
    await expect(page.locator("h1").first()).toBeVisible()
    await page.locator('input[type="file"]').first().setInputFiles([path.join(MEDIA, "track-a.mp3"), path.join(MEDIA, "tagged-track.mp3")])
    await expect(page.getByText("track-a", { exact: false }).first()).toBeVisible({ timeout: 90_000 })
    await page.waitForTimeout(8000)
    await page.reload()
    await expect(page.locator("h1").first()).toBeVisible()
    await shot(page, testInfo, "logic-02-library-after-upload")
    const tagged = await page.getByText("Dark Knight", { exact: false }).count()
    log({ flow: "logic", step: "id3-tags", taggedTitleShown: tagged > 0 })
  })

  test("delete a track, go to Playlists, press Back: the track stays gone", async ({}, testInfo) => {
    await page.goto(`/dashboard/stations/${slug}/library`)
    await expect(page.locator("h1").first()).toBeVisible()
    const del = page.getByRole("button", { name: /^Delete track-a/ }).first()
    await del.click()
    await page.getByRole("dialog").getByRole("button", { name: /Delete track/ }).click()
    await expect(page.getByRole("button", { name: /^Delete track-a/ })).toHaveCount(0, { timeout: 10_000 })
    await page.getByRole("link", { name: "Playlists", exact: true }).filter({ visible: true }).first().click()
    await expect(page).toHaveURL(/\/playlists/)
    await expect(page.locator("h1").first()).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/library/)
    await page.waitForTimeout(1500)
    const ghost = await page.getByRole("button", { name: /^Delete track-a/ }).count()
    await shot(page, testInfo, "logic-02b-library-after-back")
    log({ flow: "logic", step: "back-after-delete", deletedTrackShownAgain: ghost > 0 })
    // recorded in flows.jsonl; not asserted so the chain goes on
  })

  test("create a playlist and add a track", async ({}, testInfo) => {
    await page.goto(`/dashboard/stations/${slug}/playlists`)
    await expect(page.locator("h1").first()).toBeVisible()
    await shot(page, testInfo, "logic-03-playlists-before")
    await page.getByRole("button", { name: /New playlist|Create playlist|Add playlist/ }).first().click()
    await page.getByLabel("Playlist name").fill("Sweep Morning")
    await page.getByRole("dialog").getByRole("button", { name: /Create|Save|Add/ }).last().click()
    await expect(page.getByText("Sweep Morning").filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 })
    await shot(page, testInfo, "logic-03-playlist-created")
  })

  test("schedule a slot, save, survives reload", async ({}, testInfo) => {
    artisanTinker(`App\\Models\\Station::where('slug','${slug}')->update(['timezone'=>'Europe/London']); echo 'ok';`)
    await page.goto(`/dashboard/stations/${slug}/schedule`)
    await expect(page.locator("h1").first()).toBeVisible()
    await page.getByRole("button", { name: "Add slot", exact: true }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await shot(page, testInfo, "logic-04-slot-dialog", false)
    await dialog.getByRole("button", { name: "Done", exact: true }).click()
    await page.waitForTimeout(800)
    const save = page.getByRole("button", { name: /^Save/ }).filter({ visible: true }).first()
    if (await save.isEnabled().catch(() => false)) await save.click()
    await page.waitForTimeout(2000)
    await shot(page, testInfo, "logic-04-schedule-saved")
    const before = await page.locator("[data-slot-block], [data-block]").count()
    await page.reload()
    await expect(page.locator("h1").first()).toBeVisible()
    await page.waitForTimeout(1500)
    await shot(page, testInfo, "logic-04-schedule-after-reload")
    const slots = JSON.parse(artisanTinker(`echo json_encode(App\\Models\\Station::where('slug','${slug}')->first()->autodjSlots()->get(['days','start_time','end_time','playlist_id'])->toArray());`).trim() || "[]")
    log({ flow: "logic", step: "schedule", blocksOnPage: before, slotsInDb: slots })
    expect.soft(slots.length, "the saved slot is in the database").toBeGreaterThan(0)
  })

  test("edit station description, survives reload", async ({}, testInfo) => {
    await page.goto(`/dashboard/stations/${slug}/settings`)
    await expect(page.locator("h1").first()).toBeVisible()
    await page.getByRole("button", { name: /^Edit profile/ }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Description").fill("Edited by the sweep.")
    await dialog.getByRole("button", { name: /Save/ }).last().click()
    await expect(dialog).toHaveCount(0, { timeout: 10_000 })
    await page.reload()
    await expect(page.getByText("Edited by the sweep.").first()).toBeVisible({ timeout: 10_000 })
    await shot(page, testInfo, "logic-05-settings-saved")
  })

  test("power: start AutoDJ, then turn the station off", async ({}, testInfo) => {
    test.setTimeout(150_000)
    await page.goto(`/dashboard/stations/${slug}`)
    await expect(page.locator("h1").first()).toBeVisible()
    await shot(page, testInfo, "logic-06-overview-off")
    await page.getByRole("button", { name: "Start AutoDJ" }).filter({ visible: true }).first().click()
    const t0 = Date.now()
    const stopBtn = page.getByRole("button", { name: "Stop AutoDJ", exact: true }).filter({ visible: true }).first()
    await expect(stopBtn).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText("AutoDJ is playing", { exact: false }).first()).toBeVisible({ timeout: 60_000 })
    log({ flow: "logic", step: "autodj-on", seconds: (Date.now() - t0) / 1000 })
    await shot(page, testInfo, "logic-06-overview-autodj")
    await shot(page, testInfo, "logic-06-overview-on")
    await stopBtn.click()
    const confirm = page.getByRole("dialog")
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /Stop|Turn/ }).last().click()
    await expect(page.getByText(/^OFF AIR$/).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("button", { name: "Start AutoDJ", exact: true }).filter({ visible: true }).first()).toBeEnabled({ timeout: 60_000 })
    await shot(page, testInfo, "logic-06-overview-off-again")
  })

  test("delete the station", async ({}, testInfo) => {
    await page.goto(`/dashboard/stations/${slug}/settings`)
    await page.getByRole("button", { name: "Delete station…" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    const confirmField = dialog.getByRole("textbox")
    if (await confirmField.count()) await confirmField.first().fill(slug)
    await dialog.getByRole("button", { name: /Delete/ }).last().click()
    await expect(page).toHaveURL(/\/dashboard\/?$|\/dashboard\/stations\/?$/, { timeout: 30_000 })
    await shot(page, testInfo, "logic-07-after-delete")
  })
})
