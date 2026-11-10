import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { connect, createServer, type AddressInfo, type Socket } from "node:net"
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test"
import { E2E_PASSWORD, createE2EUser, uniqueEmail } from "./support/auth"

/**
 * The Free-plan relay end to end, with GoCast's real studio and player:
 * a Free account goes live → the studio publishes to the relay → Icecast asks
 * Laravel → a listener hears it from Icecast (no HLS) → the title reaches the
 * API and Icecast → End show → the listener's player stops itself.
 *
 * Opt-in (E2E_RELAY=1): it needs a relay stack that a normal dev box does not
 * run. Everything it talks to is redirected by page.route(), so the dev
 * server and the dev API on :8000 are left exactly as they are:
 *
 *   E2E_RELAY_API_PORT Laravel with RELAY_ENABLED=true, ICECAST_CALLBACK_*,
 *                      ICECAST_INTERNAL_URL pointing at the Icecast below,
 *                      on all interfaces (default 8001)
 *   E2E_RELAY_LISTEN   where listeners reach Icecast (default http://127.0.0.1:18080,
 *                      an nginx proxying /stream/ and /standby)
 *   E2E_RELAY_ICECAST  Icecast 2.5 admin, rendered from icecast.xml.tpl
 *                      (default http://admin:lab-admin@127.0.0.1:18000)
 *   relay/bin/gocast-relay ×2 behind that nginx at /relay, gocast-standby feeding /standby
 *
 * Run the page on the same host the client's NEXT_PUBLIC_API_URL uses
 * (E2E_BASE_URL), or the login cookie is cross-site and sign-in never lands.
 *
 * See docs/RELAY-SERVICE-PLAN.md §6, Phase 3.
 */

// Same host as the page's API, other port: the API sets the login cookie for
// the host it answers from, and a redirect to another host loses it.
const RELAY_API_PORT = process.env.E2E_RELAY_API_PORT ?? "8001"
const LISTEN = process.env.E2E_RELAY_LISTEN ?? "http://127.0.0.1:18080"
const ICECAST = new URL(process.env.E2E_RELAY_ICECAST ?? "http://admin:lab-admin@127.0.0.1:18000")

test.skip(!process.env.E2E_RELAY, "needs the relay stack; set E2E_RELAY=1")

test.use({
  // The full Chromium, not the default headless shell: only it honours
  // --unsafely-treat-insecure-origin-as-secure below.
  channel: "chromium",
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      // The studio needs a secure context; a LAN http:// page is not one.
      ...(process.env.E2E_BASE_URL ? [`--unsafely-treat-insecure-origin-as-secure=${process.env.E2E_BASE_URL}`] : []),
    ],
  },
})

/** Send every API call to the relay-enabled Laravel and every stream request to the relay stack's Icecast. */
async function redirect(context: BrowserContext) {
  await context.route(/^https?:\/\/[^/]+:8000\//, (route) => {
    const url = new URL(route.request().url())
    url.port = RELAY_API_PORT
    route.continue({ url: url.toString() })
  })
  await context.route(/\/stream-proxy\//, (route) => {
    const url = new URL(route.request().url())
    route.continue({ url: `${LISTEN}${url.pathname.replace(/^\/stream-proxy/, "")}${url.search}` })
  })
  await context.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "visible" })
    Object.defineProperty(document, "hidden", { get: () => false })
  })
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    permissions: ["microphone"],
    extraHTTPHeaders: { "X-Forwarded-For": `198.51.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 250) + 1}` },
  })
  await redirect(context)
  return context
}

async function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      // Any :8000 URL is rerouted to the relay API by redirect(). The login
      // cookie is HttpOnly, so send it the way the app's axios does.
      const res = await fetch(`${location.protocol}//${location.hostname}:8000/api${path}`, {
        method,
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: await res.json().catch(() => null) }
    },
    { method, path, body },
  )
}

async function icecastMounts(): Promise<Record<string, { title?: string; listeners?: number }>> {
  const res = await fetch(`${ICECAST.origin}/status-json.xsl`)
  const sources = (await res.json()).icestats.source ?? []
  const list = Array.isArray(sources) ? sources : [sources]
  return Object.fromEntries(list.map((s: { listenurl: string; title?: string; listeners?: number }) => [
    new URL(s.listenurl).pathname, { title: s.title, listeners: s.listeners },
  ]))
}

async function signInNewFreeUser(browser: Browser): Promise<{ context: BrowserContext; studio: Page; problems: string[] }> {
  const email = uniqueEmail("relay")
  createE2EUser({ email })
  const context = await newContext(browser)
  const studio = await context.newPage()
  const problems: string[] = []
  studio.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))

  await studio.goto("/auth/login")
  await studio.getByLabel("Email").fill(email)
  await studio.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD)
  await studio.getByRole("button", { name: "Sign in" }).click()
  await expect(studio).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  return { context, studio, problems }
}

async function createStation(studio: Page): Promise<string> {
  const created = await api<{ data: { slug: string } }>(studio, "POST", "/stations", { name: `Relay ${Date.now()}` })
  expect(created.status, JSON.stringify(created.json)).toBe(201)
  return created.json.data.slug
}

/** Through the real pre-flight, with a track in the running order so there is a title to send. */
async function goLive(studio: Page, slug: string) {
  await studio.goto(`/dashboard/stations/${slug}/live`)
  await expect(studio.getByRole("heading", { name: "Ready when you are." })).toBeVisible({ timeout: 30_000 })
  await studio.locator('input[type="file"]').first().setInputFiles(
    `${process.env.E2E_RELAY_TRACK ?? "../../gocast-relay-lab/media/tone440.mp3"}`,
  )
  await studio.waitForTimeout(1500)
  await studio.getByRole("button", { name: "Go live", exact: true }).filter({ visible: true }).first().click()
  await expect(studio.getByRole("button", { name: "End show" }).filter({ visible: true }).first()).toBeVisible({ timeout: 120_000 })
}

async function listen(browser: Browser, slug: string): Promise<{ context: BrowserContext; page: Page; streamRequests: string[] }> {
  const context = await newContext(browser)
  const page = await context.newPage()
  const streamRequests: string[] = []
  page.on("request", (r) => { if (/stream-proxy|\.m3u8/.test(r.url())) streamRequests.push(r.url()) })
  await page.goto(`/station/${slug}`)
  await page.getByRole("button", { name: /play/i }).first().click()
  await expect.poll(() => audioTime(page), { timeout: 30_000 }).toBeGreaterThan(3)
  return { context, page, streamRequests }
}

function audioTime(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector("audio")?.currentTime ?? 0)
}

test("Free station: live on the relay, heard from Icecast, title carried, player stops when it ends", async ({ browser }) => {
  test.setTimeout(240_000)
  const { context: studioContext, studio, problems } = await signInNewFreeUser(browser)
  const slug = await createStation(studio)
  await goLive(studio, slug)

  // The API says relay + live; Icecast holds the mount; no container exists.
  await expect.poll(async () => (await api<{ data: { ingest: string; state: string } }>(studio, "GET", `/stations/${slug}/status`)).json.data,
    { timeout: 20_000 }).toMatchObject({ ingest: "relay", state: "live" })
  expect(Object.keys(await icecastMounts())).toContain(`/stream/${slug}`)
  expect(execFileSync("docker", ["ps", "-q", "--filter", `name=gocast-liquidsoap-${slug}$`]).toString().trim()).toBe("")

  // A listener on the public player page: Icecast transport, audio moving.
  const { context: listenerContext, page: listener, streamRequests } = await listen(browser, slug)
  expect(streamRequests.some((u) => u.includes(`/stream-proxy/stream/${slug}`))).toBe(true)
  expect(streamRequests.some((u) => u.includes(".m3u8"))).toBe(false)
  await expect.poll(async () => (await icecastMounts())[`/stream/${slug}`]?.listeners ?? 0, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)

  // The studio's track title reached Laravel and Icecast (no metadata frame
  // crosses the relay; it goes over HTTP).
  await expect.poll(async () => (await api<{ data: { now_playing?: { title: string | null } } }>(studio, "GET", `/stations/${slug}/status`)).json.data.now_playing?.title ?? null,
    { timeout: 30_000 }).not.toBeNull()
  await expect.poll(async () => (await icecastMounts())[`/stream/${slug}`]?.title ?? "", { timeout: 15_000 }).not.toBe("")

  // End the show. The listener's player must stop by itself: Icecast would
  // keep it on /standby silence forever.
  await studio.getByRole("button", { name: "End show" }).filter({ visible: true }).first().click()
  await studio.getByRole("dialog").getByRole("button", { name: "End show" }).click()
  await expect(studio).toHaveURL(/\/studio\/wrap/, { timeout: 30_000 })

  await expect.poll(async () => (await api<{ data: { state: string } }>(studio, "GET", `/stations/${slug}/status`)).json.data.state,
    { timeout: 30_000 }).toBe("offline")
  expect(Object.keys(await icecastMounts())).not.toContain(`/stream/${slug}`)
  await expect.poll(() => listener.evaluate(() => {
    const audio = document.querySelector("audio")
    return !audio || audio.paused || !audio.getAttribute("src")
  }), { timeout: 30_000 }).toBe(true)

  expect(problems).toEqual([])
  await listenerContext.close()
  await studioContext.close()
})

/**
 * The relay copy carrying the show dies (kill -9). GoCast's own reconnect
 * loop has to land on the other copy — retrying the "already live" (4009) it
 * can meet while the dead connection still holds the mount — and the
 * listener must keep playing without pressing anything.
 */
test("a relay copy dies mid-show: the studio reconnects and the listener keeps playing", async ({ browser }) => {
  test.setTimeout(240_000)
  const health = (process.env.E2E_RELAY_HEALTH ?? "18195,18196").split(",")
  const { context: studioContext, studio, problems } = await signInNewFreeUser(browser)
  const slug = await createStation(studio)
  await goLive(studio, slug)
  const { context: listenerContext, page: listener } = await listen(browser, slug)

  const copies = await Promise.all(health.map(async (port) =>
    (await fetch(`http://127.0.0.1:${port}/healthz`)).json() as Promise<{ pid: number; active: number }>))
  const carrying = copies.find((c) => c.active > 0)
  expect(carrying, JSON.stringify(copies)).toBeTruthy()
  const killedAt = Date.now()
  execFileSync("kill", ["-9", String(carrying!.pid)])
  let offAirMs = 0
  for (let i = 0; i < 100; i++) {
    const up = (await icecastMounts())[`/stream/${slug}`] !== undefined
    if (!up && offAirMs === 0) offAirMs = -(Date.now() - killedAt)
    if (up && offAirMs < 0) { offAirMs = Date.now() - killedAt; break }
    await listener.waitForTimeout(100)
  }
  console.log("source back on Icecast after", offAirMs, "ms from kill")

  // Back on air through the other copy, the same show, with no new session
  // gap that outlasts a few seconds.
  await expect.poll(async () => (await icecastMounts())[`/stream/${slug}`] !== undefined, { timeout: 30_000 }).toBe(true)
  await expect.poll(async () => (await api<{ data: { state: string } }>(studio, "GET", `/stations/${slug}/status`)).json.data.state,
    { timeout: 30_000 }).toBe("live")
  await expect(studio.getByRole("button", { name: "End show" }).filter({ visible: true }).first()).toBeVisible()

  // The listener never stopped: their clock keeps moving over the next 10 s.
  const before = await audioTime(listener)
  await listener.waitForTimeout(10_000)
  expect(await audioTime(listener) - before).toBeGreaterThan(7)

  await studio.getByRole("button", { name: "End show" }).filter({ visible: true }).first().click()
  await studio.getByRole("dialog").getByRole("button", { name: "End show" }).click()
  await expect(studio).toHaveURL(/\/studio\/wrap/, { timeout: 30_000 })
  expect(problems).toEqual([])
  await listenerContext.close()
  await studioContext.close()
})

/**
 * Every source drop splices the listener onto /standby and back mid-frame,
 * and now and then Chrome's decoder dies on the half frame
 * (MEDIA_ERR_DECODE, a few drops in a hundred). The player must reconnect by
 * itself.
 *
 * Publishes straight to the station's mount with the source login (what the
 * relay would carry) so the drops are abrupt and frequent: kill -9, 1.2 s
 * off, back, twenty times.
 */
test("a listener survives repeated abrupt source drops", async ({ browser }) => {
  test.setTimeout(300_000)
  const password = process.env.E2E_RELAY_SOURCE_PASSWORD ?? "lab-liquidsoap"
  const track = process.env.E2E_RELAY_TRACK ?? "../../gocast-relay-lab/media/tone440.mp3"
  const { context: ownerContext, studio: owner } = await signInNewFreeUser(browser)
  const slug = await createStation(owner)
  expect((await api(owner, "POST", `/stations/${slug}/start`)).status).toBe(202)

  const source = (): ChildProcess => spawn("ffmpeg", [
    "-loglevel", "error", "-nostdin", "-re", "-stream_loop", "-1", "-i", track, "-c", "copy",
    "-content_type", "audio/mpeg", "-f", "mp3", `icecast://source:${password}@${ICECAST.host}/stream/${slug}`,
  ], { stdio: "ignore" })
  let feeding = source()
  await expect.poll(async () => (await icecastMounts())[`/stream/${slug}`] !== undefined, { timeout: 15_000 }).toBe(true)

  const { context: listenerContext, page: listener } = await listen(browser, slug)
  await listener.evaluate(() => {
    const audio = document.querySelector("audio")!
    const w = window as unknown as { __errors: number }
    w.__errors = 0
    audio.addEventListener("error", () => { w.__errors++ })
  })

  try {
    for (let i = 0; i < 20; i++) {
      feeding.kill("SIGKILL")
      await listener.waitForTimeout(1200)
      feeding = source()
      await listener.waitForTimeout(4000)
    }
    // Still playing, with nobody pressing anything: the clock moves. Waited
    // out first, in case the last drop has just caused a reconnect.
    await listener.waitForTimeout(12_000)
    const before = await audioTime(listener)
    await listener.waitForTimeout(5000)
    const errors = await listener.evaluate(() => (window as unknown as { __errors: number }).__errors)
    console.log(`decode errors recovered from: ${errors}`)
    expect(await audioTime(listener) - before).toBeGreaterThan(3)
  } finally {
    feeding.kill("SIGKILL")
    await api(owner, "POST", `/stations/${slug}/stop`)
    await listenerContext.close()
    await ownerContext.close()
  }
})

/**
 * The player's own safety net, for what the element's events miss. Both were
 * a background tab overnight on staging: audio playing under a spinner that
 * never cleared, and a listener who had to press play again.
 *
 *  1. `waiting` with no `playing` after it: the spinner must clear as soon as
 *     the playhead is seen moving.
 *  2. A stream that goes silent with its connection still open — no error,
 *     no end — must be reconnected by the player, unprompted. The stream runs
 *     through a proxy here that freezes every connection open at the time.
 */
test("the player clears a stale spinner and reconnects a silently stalled stream", async ({ browser }) => {
  test.setTimeout(180_000)
  const password = process.env.E2E_RELAY_SOURCE_PASSWORD ?? "lab-liquidsoap"
  const track = process.env.E2E_RELAY_TRACK ?? "../../gocast-relay-lab/media/tone440.mp3"
  const { context: ownerContext, studio: owner } = await signInNewFreeUser(browser)
  const slug = await createStation(owner)
  expect((await api(owner, "POST", `/stations/${slug}/start`)).status).toBe(202)
  const feeding = spawn("ffmpeg", [
    "-loglevel", "error", "-nostdin", "-re", "-stream_loop", "-1", "-i", track, "-c", "copy",
    "-content_type", "audio/mpeg", "-f", "mp3", `icecast://source:${password}@${ICECAST.host}/stream/${slug}`,
  ], { stdio: "ignore" })
  await expect.poll(async () => (await icecastMounts())[`/stream/${slug}`] !== undefined, { timeout: 15_000 }).toBe(true)

  const proxy = await freezableProxy(new URL(LISTEN))
  const listenerContext = await newContext(browser)
  // Registered after newContext's routes, so it wins for the stream.
  await listenerContext.route(/\/stream-proxy\//, (route) => {
    const url = new URL(route.request().url())
    route.continue({ url: `http://127.0.0.1:${proxy.port}${url.pathname.replace(/^\/stream-proxy/, "")}${url.search}` })
  })
  const listener = await listenerContext.newPage()
  const spinning = () => listener.locator("button .animate-spin").count().then((n) => n > 0)

  try {
    await listener.goto(`/station/${slug}`)
    await listener.getByRole("button", { name: /play/i }).first().click()
    await expect.poll(() => audioTime(listener), { timeout: 30_000 }).toBeGreaterThan(3)

    // 1. A `waiting` that no `playing` follows.
    await listener.evaluate(() => document.querySelector("audio")!.dispatchEvent(new Event("waiting")))
    expect(await spinning()).toBe(true)
    await expect.poll(spinning, { timeout: 5_000 }).toBe(false)
    await expect(listener.getByRole("button", { name: "Pause" }).first()).toBeVisible()

    // 2. The open connection goes silent for good. Nothing errors; only the
    // watchdog can notice. It reconnects (a new request through the proxy)
    // and the playhead moves again on its own.
    const connectionsBefore = proxy.connections()
    proxy.freeze()
    const frozenAt = await audioTime(listener)
    await expect.poll(() => proxy.connections(), { timeout: 40_000 }).toBeGreaterThan(connectionsBefore)
    await expect.poll(() => audioTime(listener), { timeout: 30_000 }).toBeGreaterThan(frozenAt + 3)
    await expect.poll(spinning, { timeout: 5_000 }).toBe(false)
    console.log(`stalled at ${frozenAt.toFixed(1)} s; reconnected by the watchdog, connections ${connectionsBefore} → ${proxy.connections()}`)
  } finally {
    feeding.kill("SIGKILL")
    proxy.close()
    await api(owner, "POST", `/stations/${slug}/stop`)
    await listenerContext.close()
    await ownerContext.close()
  }
})

/** A TCP proxy to `target` whose freeze() silences every connection open at the time, leaving them open. */
async function freezableProxy(target: URL) {
  const open = new Set<{ client: Socket; upstream: Socket }>()
  let count = 0
  const server = createServer((client) => {
    count++
    const upstream = connect(Number(target.port || 80), target.hostname)
    const pair = { client, upstream }
    open.add(pair)
    client.pipe(upstream)
    upstream.pipe(client)
    const drop = () => { open.delete(pair); client.destroy(); upstream.destroy() }
    client.on("error", drop).on("close", drop)
    upstream.on("error", drop).on("close", drop)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return {
    port: (server.address() as AddressInfo).port,
    connections: () => count,
    freeze: () => {
      for (const { client, upstream } of open) {
        upstream.unpipe(client)
        upstream.pause()
      }
    },
    close: () => {
      for (const { client, upstream } of open) { client.destroy(); upstream.destroy() }
      server.close()
    },
  }
}
