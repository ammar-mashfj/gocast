import fs from "node:fs"
import path from "node:path"
import { test, expect, type Page, type Locator } from "@playwright/test"

/**
 * Captures the screenshots used by the /help articles.
 *
 * NOT a test — it asserts almost nothing and is kept out of the normal run by
 * its `@screenshots` tag. It lives here because Playwright is the only thing in
 * the repo that can produce a usable screenshot: it renders at
 * `deviceScaleFactor: 2` and writes lossless PNG, where a browser-extension
 * capture comes back downscaled to 1568px and JPEG-compressed, which turns
 * small UI text to mush.
 *
 * Framing comes from `clip` rectangles read off real bounding boxes rather than
 * hand-guessed pixel rects, so a reflow moves the crop with the element instead
 * of silently slicing it. Every box is logged, which is how you check the
 * framing without opening the files.
 *
 * Run against a DRESSED database (see the shoot scripts in the scratchpad):
 *   npx playwright test help-screenshots --grep @screenshots
 */

const OUT = path.resolve(process.cwd(), "tests/e2e/.screenshots")
const STATION = "test"
const at = (page: string) => `/dashboard/stations/${STATION}${page}`

test.use({
  // 2x is the whole point: text renders at double resolution and stays crisp
  // when the article displays the image at half its pixel width.
  deviceScaleFactor: 2,
  // Wide enough that the dashboard's two-up card rows stay side by side; they
  // stack below roughly 1500 and the framing changes completely.
  viewport: { width: 1680, height: 1050 },
})

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true })
})

async function signIn(page: Page) {
  await page.goto("/auth/login")
  await page.getByLabel("Email").fill("ammarmashfj.ru@gmail.com")
  await page.getByLabel("Password").fill("ShootPass123!")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}

/**
 * Wait for everything that makes a screenshot look broken: webfonts not yet
 * swapped, lazy images still empty, and the status poll still on "Checking…".
 */
async function settle(page: Page, opts: { status?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    document.querySelectorAll("img").forEach((i) => {
      i.loading = "eager"
      i.src = i.src
    })
    await Promise.all(
      [...document.querySelectorAll("img")].map((i) =>
        i.complete ? Promise.resolve() : new Promise((r) => i.addEventListener("load", r, { once: true })),
      ),
    )
  })
  if (opts.status) {
    await expect(page.getByText("Checking…").first()).toBeHidden({ timeout: 30_000 })
  }
  await page.waitForTimeout(600)
}

type Box = { x: number; y: number; width: number; height: number }

/** Union of several elements' boxes, padded, clamped to the viewport. */
async function clipOf(page: Page, targets: Locator[], pad = 14): Promise<Box> {
  const boxes: Box[] = []
  for (const t of targets) {
    const b = await t.boundingBox()
    if (!b) throw new Error("element has no box — it is probably hidden")
    boxes.push(b)
  }
  const x = Math.min(...boxes.map((b) => b.x)) - pad
  const y = Math.min(...boxes.map((b) => b.y)) - pad
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad
  const vp = page.viewportSize()!
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.min(right, vp.width) - Math.max(0, x),
    height: Math.min(bottom, vp.height) - Math.max(0, y),
  }
}


/**
 * The box of the nearest ancestor at least `minWidth` wide.
 *
 * `xpath=ancestor::div[contains(@class,'rounded')]` is not enough on its own —
 * card headers are rounded containers too, so it happily returns a 60px-tall
 * title bar. Walking up until the element is actually card-sized is the
 * property we mean, and it survives markup changes that a class name does not.
 */
async function cardBox(target: Locator, minWidth = 600, minHeight = 0): Promise<Box> {
  return target.evaluate(
    (el, { w, h }) => {
      let n: HTMLElement | null = el as HTMLElement
      // BOTH dimensions, because a card's own header row is full width and
      // ~50px tall — stopping on width alone returns the title bar.
      while (n?.parentElement) {
        const r = n.getBoundingClientRect()
        if (r.width >= w && r.height >= h) break
        n = n.parentElement
      }
      const r = (n ?? (el as HTMLElement)).getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    },
    { w: minWidth, h: minHeight },
  )
}

/** Pad a box and clamp it to the viewport. */
function padded(page: Page, b: Box, pad = 14): Box {
  const vp = page.viewportSize()!
  const x = Math.max(0, b.x - pad)
  const y = Math.max(0, b.y - pad)
  return {
    x,
    y,
    width: Math.min(b.x + b.width + pad, vp.width) - x,
    height: Math.min(b.y + b.height + pad, vp.height) - y,
  }
}

async function shot(page: Page, name: string, clip?: Box) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: "disabled", clip })
  const size = clip ? `${Math.round(clip.width)}x${Math.round(clip.height)} css` : "viewport"
  console.log(`captured ${name.padEnd(22)} ${size}`)
}

test.describe("@screenshots", () => {
  test("capture help article screenshots", async ({ page }) => {
    test.setTimeout(300_000)
    await signIn(page)

    // ---- station overview: the two power cards, side by side --------------
    await page.goto(at(""))
    await settle(page, { status: true })

    const powerCard = page.locator("section").filter({ hasText: "ON AIR" }).first()
    const nowPlaying = page.locator("section").filter({ hasText: "NOW PLAYING" }).first()
    await shot(page, "station-power", await clipOf(page, [powerCard, nowPlaying]))

    const artwork = page.getByRole("img", { name: /Night Shift Radio/i }).first()
    const blurb = page.getByText(/Late-night electronic, ambient and lo-fi/)
    await shot(page, "station-header", await clipOf(page, [artwork, blurb], 18))

    await shot(page, "autodj-rotation",
      padded(page, await cardBox(page.getByText("AutoDJ rotation").first(), 700, 180)))

    // ---- library ----------------------------------------------------------
    await page.goto(at("/library"))
    await settle(page)
    await shot(page, "music-library",
      padded(page, await cardBox(page.getByText("Showing 8 of 8"), 1300, 400), 18))

    // ---- schedule ---------------------------------------------------------
    await page.goto(at("/schedule"))
    await settle(page)
    const onNow = page.getByText("ON NOW").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    await shot(page, "schedule-on-now", await clipOf(page, [onNow], 8))

    const firstSlot = page.getByPlaceholder("Label (optional)").first()
    await firstSlot.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await shot(page, "schedule-slots", padded(page, await cardBox(firstSlot, 1300, 480), 18))

    const week = page.getByText("THIS WEEK").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    await week.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await shot(page, "schedule-week", await clipOf(page, [week]))

    // ---- settings / encoder ----------------------------------------------
    await page.goto(at("/settings"))
    await settle(page)
    const encoder = page.getByText("Broadcast from your own software")
    await encoder.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    // Take the card's width but stop at the troubleshooting link, so the shot
    // ends on a complete thought instead of mid-sentence at the viewport edge.
    const encCard = await cardBox(encoder, 520, 320)
    const encEnd = (await page.getByText(/Not connecting\?/).boundingBox())!
    await shot(page, "encoder-connection", padded(page, {
      ...encCard,
      height: encEnd.y + encEnd.height - encCard.y,
    }))

    // ---- audience ---------------------------------------------------------
    await page.goto(`${at("/audience")}?days=30`)
    await settle(page)
    const stats = page.getByText("Listening time").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    const chart = page.getByText("Last 30 days").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    await shot(page, "audience-chart", await clipOf(page, [stats, chart]))

    const countries = page.getByText("Countries").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    const referrers = page.getByText("Where they came from").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    await countries.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await shot(page, "audience-breakdowns", await clipOf(page, [countries, referrers]))

    // ---- tune-in QR -------------------------------------------------------
    await page.goto(at(""))
    await settle(page, { status: true })
    await page.getByRole("button", { name: "Tune-in code" }).first().click()
    await page.waitForTimeout(900)
    // Stop above the URL line: it reads http://localhost:3000/... in dev, which
    // is the one dev-ism a reader would mistake for their own address.
    const qrDialog = (await page.getByRole("dialog").first().boundingBox())!
    const qrImg = (await page.getByRole("dialog").first().locator("canvas, img, svg").first().boundingBox())!
    await shot(page, "share-qr", {
      x: qrDialog.x,
      y: qrDialog.y,
      width: qrDialog.width,
      height: qrImg.y + qrImg.height + 18 - qrDialog.y,
    })
    await page.keyboard.press("Escape")

    // ---- go-live steps ----------------------------------------------------
    await page.goto(at("/live"))
    await settle(page)
    const preflight = page.getByText("You're about to go live on").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    await shot(page, "go-live-preflight", await clipOf(page, [preflight], 0))

    // ---- public player page ----------------------------------------------
    await page.goto(`/station/${STATION}`)
    await settle(page)
    await shot(page, "player-page")

    const playerBar = page.getByText("NOW PLAYING").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first()
    await shot(page, "player-now-playing", await clipOf(page, [playerBar], 0))
  })
})
