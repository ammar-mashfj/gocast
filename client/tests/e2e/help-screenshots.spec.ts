import fs from "node:fs"
import path from "node:path"
import { test, expect, type Page, type Locator } from "@playwright/test"
import { E2E_PASSWORD } from "./support/auth"

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
 * Runs against the keeper review account (shell@gocast.test, station
 * night-shift-shell — see docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md, R6.3) and
 * changes nothing in it. Two pieces of staging happen in the page only:
 *   - `dress()` swaps the factory placeholder genre and description for real
 *     words and puts artwork in the header tile (support/help-artwork.webp);
 *   - the Schedule shots draw a few slots on screen and never press Save
 *     (the planner sends nothing until Save).
 *
 *   npm run test:help-shots   (E2E_CAPTURE=1 lifts the config's grepInvert)
 *
 * PNGs land in tests/e2e/.screenshots/; convert to webp for public/help/:
 *   for f in tests/e2e/.screenshots/*.png; do
 *     convert "$f" -quality 85 "public/help/$(basename "${f%.png}").webp"; done
 *
 * The public player page shots (player-page, player-now-playing) are not
 * taken here any more: that page wasn't part of the dashboard redesign and
 * the review station has no stream to show.
 */

const OUT = path.resolve(process.cwd(), "tests/e2e/.screenshots")
const STATION = "night-shift-shell"
const at = (page: string) => `/dashboard/stations/${STATION}${page}`
const ARTWORK = path.resolve(process.cwd(), "tests/e2e/support/help-artwork.webp")

test.use({
  // 2x is the whole point: text renders at double resolution and stays crisp
  // when the article displays the image at half its pixel width.
  deviceScaleFactor: 2,
  // Wide enough that the dashboard's two-up card rows stay side by side; they
  // stack below roughly 1500 and the framing changes completely.
  viewport: { width: 1680, height: 1050 },
  // A locator that can't be found fails in seconds, not at the 5-minute cap.
  actionTimeout: 10_000,
})

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true })
})

async function signIn(page: Page) {
  await page.goto("/auth/login")
  await page.getByLabel("Email").fill("shell@gocast.test")
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
}

/**
 * Page-only staging: the review station was made by a factory, so its genre
 * and description are placeholder Latin and it has no artwork; and dev's
 * encoder server is an IP. Swap the words in the DOM and drop artwork into
 * the header tile. Nothing is saved.
 */
async function dress(page: Page) {
  const art = `data:image/webp;base64,${fs.readFileSync(ARTWORK).toString("base64")}`
  await page.evaluate(
    ({ pairs, art }) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (const [from, to] of pairs) if (n.nodeValue?.includes(from)) n.nodeValue = n.nodeValue.replace(from, to)
      }
      const tile = document.querySelector<HTMLButtonElement>('button[aria-label="Add station artwork"]')
      if (tile) {
        const img = document.createElement("img")
        img.src = art
        img.alt = ""
        img.className = "size-20 object-cover sm:size-26"
        tile.replaceChildren(img)
      }
    },
    {
      pairs: [
        ["voluptatem", "Electronic"],
        ["Ab deleniti placeat consectetur autem quidem.", "Late-night electronic, ambient and lo-fi for the hours after midnight."],
        // Dev's encoder host is the machine's address; show the kind of
        // hostname a reader will see (the shots before these did the same).
        ["127.0.0.1", "ingest.gocast.fm"],
      ],
      art,
    },
  )
  await page.waitForTimeout(200)
}

/** Close the slot dialog and wait for it to go, so the next click lands on the week. */
async function done(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

/** Click a day row of the Schedule week at an hour, which opens a new one-hour slot. */
async function clickHour(page: Page, weekRow: number, hour: number) {
  const row = page.locator("[data-day-row]").nth(weekRow)
  const box = (await row.boundingBox())!
  await page.mouse.click(box.x + (box.width * (hour + 0.5)) / 24, box.y + box.height / 2)
  await expect(page.getByRole("dialog")).toBeVisible()
}

/** Fill the open slot dialog: name, playlist, times, and extra days to tick. */
async function fillSlot(page: Page, opts: { name: string; playlist: string; from: string; to: string; days?: string[] }) {
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill(opts.name)
  await dialog.getByRole("radio", { name: new RegExp(opts.playlist) }).click()
  const times = dialog.locator('input[type="time"]')
  await times.nth(0).fill(opts.from)
  await times.nth(1).fill(opts.to)
  // The chips are named in full ("Monday"); they only show two letters.
  for (const day of opts.days ?? []) await dialog.getByRole("button", { name: day, exact: true }).click({ timeout: 5_000 })
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
    await expect(page.getByText("Checking…")).toHaveCount(0, { timeout: 30_000 })
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
    // Headless tabs report hidden, which pauses the status poll.
    await page.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { get: () => "visible" })
      Object.defineProperty(document, "hidden", { get: () => false })
    })
    await signIn(page)

    // ---- station overview -------------------------------------------------
    await page.goto(at(""))
    await settle(page, { status: true })
    await dress(page)

    // The hero: what's on air, the buttons that change it, listening now.
    const hero = page.getByRole("heading", { name: "Nothing’s playing right now." })
    await shot(page, "station-power", padded(page, await cardBox(hero, 1000, 180), 0))

    const header = page.locator("header").filter({ has: page.locator("h1") }).first()
    await shot(page, "station-header", await clipOf(page, [header.locator("button").first(), header.locator("h1").locator("xpath=../..")], 18))

    // Was the AutoDJ rotation card, which no longer exists: Coming up names
    // the playlist AutoDJ moves to next and when.
    await shot(page, "autodj-rotation", padded(page, await cardBox(page.getByText("Coming up").first(), 500, 150), 0))

    // ---- tune-in QR -------------------------------------------------------
    await page.getByRole("button", { name: "Tune-in code" }).click()
    const qr = page.getByRole("dialog")
    await expect(qr).toBeVisible()
    await page.waitForTimeout(700)
    // Stop above the URL line: it reads localhost in dev, the one dev-ism a
    // reader would mistake for their own address.
    const qrBox = (await qr.boundingBox())!
    // The white tile around the code, not the code: it has its own padding.
    const qrImg = (await qr.locator("canvas, img, svg").first().locator("..").boundingBox())!
    await shot(page, "share-qr", { x: qrBox.x, y: qrBox.y, width: qrBox.width, height: qrImg.y + qrImg.height + 18 - qrBox.y })
    await page.keyboard.press("Escape")

    // ---- AutoDJ library ---------------------------------------------------
    await page.goto(at("/library"))
    await settle(page)
    await shot(page, "music-library", padded(page, await cardBox(page.getByRole("button", { name: /All tracks/ }).first(), 1100, 400), 18))

    // ---- schedule ---------------------------------------------------------
    await page.goto(at("/schedule"))
    await settle(page)
    await shot(page, "schedule-on-now", padded(page, await cardBox(page.getByText("Right now", { exact: true }), 1100, 80), 0))

    // Draw a believable week on screen. Nothing is saved.
    await page.locator("[data-day-row] button[title^='Morning Soul']").first().click()
    await fillSlot(page, { name: "Breakfast", playlist: "Morning Soul", from: "06:00", to: "10:00", days: ["Monday", "Tuesday", "Thursday", "Friday"] })
    await page.waitForTimeout(300)
    const slotDialog = page.getByRole("dialog")
    await shot(page, "schedule-slots", padded(page, (await slotDialog.boundingBox())!, 0))
    await done(page)

    await clickHour(page, 0, 17)
    await fillSlot(page, { name: "Drive time", playlist: "Main rotation", from: "16:00", to: "19:00", days: ["Tuesday", "Wednesday", "Thursday", "Friday"] })
    await done(page)

    // Friday 23:00–02:00 carries into Saturday: the crossing-midnight case.
    await clickHour(page, 4, 22)
    await fillSlot(page, { name: "After hours", playlist: "Main rotation", from: "23:00", to: "02:00" })
    await done(page)
    await page.waitForTimeout(400)

    const week = page.getByRole("heading", { name: "This week" })
    await week.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot(page, "schedule-week", padded(page, await cardBox(week, 1100, 400), 0))

    // ---- settings: own DJ software ---------------------------------------
    // The planner has unsaved slots; leaving would prompt, so drop the guard.
    page.on("dialog", (d) => d.accept())
    await page.goto(at("/settings"))
    await settle(page)
    await page.getByRole("button", { name: /Use your own DJ software/ }).click()
    await page.waitForTimeout(400)
    const djCard = page.getByRole("button", { name: /Use your own DJ software/ })
    await djCard.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    // From the card's top to the end of the five values.
    await dress(page)
    // The open card is taller than what's left below it: bring its top up so
    // the five values fit in the viewport the clip is clamped to.
    const top = (await cardBox(djCard, 500, 200)).y
    // Below the sticky top bar and status band (--chrome-h), not under them.
    await page.evaluate((y) => {
      const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chrome-h")) || 112
      window.scrollBy(0, y - chrome - 24)
    }, top)
    await page.waitForTimeout(300)
    const cardTop = await cardBox(djCard, 500, 200)
    const keyHint = (await page.getByText("Also called the stream key or source password.").boundingBox())!
    await shot(page, "encoder-connection", padded(page, { ...cardTop, height: keyHint.y + keyHint.height + 28 - cardTop.y }, 0))

    // ---- audience ---------------------------------------------------------
    await page.goto(`${at("/audience")}?days=30`)
    await settle(page)
    const tiles = page.getByText("Listening time", { exact: true }).first()
    const chart = page.getByRole("heading", { name: "Listening time per day" })
    // The four tiles (a row at least 1100 wide) down to the chart card's foot.
    const tileRow = await cardBox(tiles, 1100, 60)
    const chartCard = (await chart.locator('xpath=ancestor::*[@data-slot="ds-card"][1]').boundingBox())!
    await shot(page, "audience-chart", padded(page, { ...tileRow, height: chartCard.y + chartCard.height - tileRow.y }, 0))

    const countries = page.getByRole("heading", { name: "Countries" })
    await countries.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot(page, "audience-breakdowns", padded(page, await cardBox(countries, 1100, 300), 0))
  })
})
