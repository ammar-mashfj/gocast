import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { IDLE_MS, WARN_MS, idleEndedKey } from "@/lib/idleShow"
import { setSigningOut } from "@/lib/signOutState"

/**
 * The idle check on Free live shows: an hour with no activity asks, ten
 * minutes without an answer ends the show. Driven on a fake clock; the
 * broadcast, the plan and the checkout are stand-ins.
 */

const broadcast = {
  state: "live" as string,
  stationSlug: "jazz" as string | null,
  liveSince: 0 as number | null,
  getTransportStats: () => null,
  engine: null,
  stop: vi.fn(),
}
type TestPlan = { autodj_enabled: boolean; idle_check?: { idle_seconds: number; warn_seconds: number } | null }
const FREE: TestPlan = { autodj_enabled: false, idle_check: { idle_seconds: IDLE_MS / 1000, warn_seconds: WARN_MS / 1000 } }
let plan: TestPlan | null = FREE
const openCheckout = vi.fn()
const endShow = vi.fn(async () => {})
const reportIdleCheck = vi.fn()
const push = vi.fn()

vi.mock("@/contexts/BroadcastContext", () => ({ useBroadcast: () => broadcast }))
vi.mock("@/contexts/AccountContext", () => ({ usePlan: () => plan }))
vi.mock("@/contexts/ProCheckoutContext", () => ({ useProCheckout: () => ({ open: openCheckout }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/dashboard/stations/jazz/studio" }))
vi.mock("@/components/studio/EndBroadcast", () => ({
  endShow: (...args: unknown[]) => endShow(...(args as [])),
  endShowFailed: vi.fn(),
}))
vi.mock("@/lib/idleShow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/idleShow")>()),
  reportIdleCheck: (...args: unknown[]) => reportIdleCheck(...(args as [])),
}))

/**
 * In-memory BroadcastChannel: every channel of a name hears every other one,
 * synchronously, as tabs of one browser would (but never itself).
 */
class FakeChannel {
  static open = new Set<FakeChannel>()
  onmessage: ((e: MessageEvent) => void) | null = null
  constructor(public name: string) {
    FakeChannel.open.add(this)
  }
  postMessage(data: unknown) {
    FakeChannel.open.forEach((c) => {
      if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent)
    })
  }
  close() {
    FakeChannel.open.delete(this)
  }
}
vi.stubGlobal("BroadcastChannel", FakeChannel)
/** Activity in another dashboard tab of the same browser. */
const otherTabActivity = () => new FakeChannel("gocast-studio-activity").postMessage(Date.now())

// Before the import: react-idle-timer binds window.setTimeout once, when it
// loads, so the fake clock has to be in place first and stay for the file.
vi.useFakeTimers()
const { IdleShowGuard } = await import("./IdleShowGuard")

/** Advance the fake clock, letting React flush what the timers set. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const MIN = 60 * 1000
const question = () => screen.queryByText("Still at the desk?")

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") })
  fireEvent(document, new Event("visibilitychange"))
}

describe("IdleShowGuard", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-16T20:00:00Z"))
    broadcast.state = "live"
    broadcast.stationSlug = "jazz"
    broadcast.liveSince = Date.now()
    plan = FREE
    sessionStorage.clear()
    document.title = "● LIVE · Jazz | GoCast"
    setHidden(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
    setSigningOut(false)
  })

  it("asks after an hour with nobody at the desk", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS - MIN)
    expect(question()).toBeNull()
    await wait(MIN + 1000)
    expect(question()).toBeInTheDocument()
    expect(screen.getByText(/^(10:00|9:5\d)$/)).toBeInTheDocument()
  })

  it("starts the hour again on any activity", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS - 5 * MIN)
    fireEvent.mouseMove(document)
    // Past the first hour: still nothing, the touch at 55 minutes restarted it.
    await wait(10 * MIN)
    expect(question()).toBeNull()
    // An hour after the touch, it asks.
    await wait(51 * MIN)
    expect(question()).toBeInTheDocument()
  })

  it("ends the show ten minutes after an unanswered question", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    expect(question()).toBeInTheDocument()
    expect(document.title).toMatch(/^⚠ Still on air\? \d+:\d\d$/)

    // Activity while the question is up doesn't answer it.
    fireEvent.mouseMove(document)
    await wait(WARN_MS)

    expect(endShow).toHaveBeenCalledOnce()
    expect(endShow).toHaveBeenCalledWith(expect.objectContaining({ slug: "jazz", after: "off_air", autoDjLocked: true }))
    expect(reportIdleCheck).toHaveBeenCalledWith("jazz", "ended", expect.objectContaining({ hidden: false }))
    expect(sessionStorage.getItem(idleEndedKey("jazz"))).not.toBeNull()
    expect(document.title).toBe("● LIVE · Jazz | GoCast")
  })

  it("stands back when the countdown runs out during a sign-out", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    expect(question()).toBeInTheDocument()
    // Sign-out is ending the show and loading the homepage itself; a second
    // stop and a push to the wrap screen would stack navigations.
    setSigningOut(true)
    await wait(WARN_MS)
    expect(endShow).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it("keeps the show when the host answers", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    fireEvent.click(screen.getByRole("button", { name: "Yes, I’m still here" }))
    await wait(WARN_MS + MIN)

    expect(endShow).not.toHaveBeenCalled()
    expect(reportIdleCheck).toHaveBeenCalledWith("jazz", "kept", expect.anything())
    expect(question()).toBeNull()
    expect(document.title).toBe("● LIVE · Jazz | GoCast")
  })

  it("ends the show when the host chooses End show, without the idle card", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    fireEvent.click(screen.getByRole("button", { name: "End show" }))
    await wait(0)

    expect(endShow).toHaveBeenCalledOnce()
    expect(endShow).toHaveBeenCalledWith(expect.objectContaining({ slug: "jazz", after: "off_air", autoDjLocked: true }))
    expect(reportIdleCheck).toHaveBeenCalledWith("jazz", "ended_by_host", expect.anything())
    expect(sessionStorage.getItem(idleEndedKey("jazz"))).toBeNull()
    expect(question()).toBeNull()

    // The countdown running out afterwards doesn't end it a second time.
    await wait(WARN_MS + MIN)
    expect(endShow).toHaveBeenCalledOnce()
  })

  it("opens checkout from Get AutoDJ, keeping the show", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    fireEvent.click(screen.getByRole("button", { name: "Get AutoDJ" }))
    await wait(WARN_MS + MIN)

    expect(openCheckout).toHaveBeenCalledOnce()
    expect(endShow).not.toHaveBeenCalled()
  })

  it("never checks a station with AutoDJ (Pro)", async () => {
    plan = { autodj_enabled: true, idle_check: null }
    render(<IdleShowGuard />)
    await wait(IDLE_MS + WARN_MS + MIN)
    expect(question()).toBeNull()
    expect(endShow).not.toHaveBeenCalled()
  })

  it("never checks when nobody is live", async () => {
    broadcast.state = "idle"
    render(<IdleShowGuard />)
    await wait(IDLE_MS + WARN_MS + MIN)
    expect(question()).toBeNull()
  })

  it("counts coming back to the tab, but not leaving it", async () => {
    render(<IdleShowGuard />)
    await wait(30 * MIN)
    // Switching away is not activity: the hour keeps running from the last touch.
    setHidden(true)
    await wait(30 * MIN + 1000)
    expect(question()).toBeInTheDocument()
  })

  it("restarts the hour when the host returns to the tab", async () => {
    render(<IdleShowGuard />)
    setHidden(true)
    await wait(50 * MIN)
    setHidden(false)
    await wait(50 * MIN)
    expect(question()).toBeNull()
  })

  it("counts activity in another dashboard tab", async () => {
    render(<IdleShowGuard />)
    await wait(50 * MIN)
    otherTabActivity()
    await wait(50 * MIN)
    expect(question()).toBeNull()
    await wait(11 * MIN)
    expect(question()).toBeInTheDocument()
  })

  it("doesn't let another tab answer the question", async () => {
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    otherTabActivity()
    await wait(WARN_MS)
    expect(endShow).toHaveBeenCalledOnce()
  })

  it("tells other tabs when someone is here", async () => {
    broadcast.state = "idle"
    const heard = vi.fn()
    const otherTab = new FakeChannel("gocast-studio-activity")
    otherTab.onmessage = heard
    render(<IdleShowGuard />)
    fireEvent.keyDown(document)
    fireEvent.keyDown(document)
    expect(heard).toHaveBeenCalledOnce()
    otherTab.close()
  })

  it("uses the timings the API sends", async () => {
    plan = { autodj_enabled: false, idle_check: { idle_seconds: 10, warn_seconds: 10 } }
    render(<IdleShowGuard />)
    await wait(9_000)
    expect(question()).toBeNull()
    await wait(1_500)
    expect(question()).toBeInTheDocument()
    expect(screen.getByText(/for 10 seconds/)).toBeInTheDocument()
    await wait(10_000)
    expect(endShow).toHaveBeenCalledOnce()
  })

  it("is off when the API switches it off", async () => {
    plan = { autodj_enabled: false, idle_check: null }
    render(<IdleShowGuard />)
    await wait(IDLE_MS + WARN_MS + MIN)
    expect(question()).toBeNull()
  })

  it("falls back to an hour on an API that doesn't send the timings yet", async () => {
    plan = { autodj_enabled: false }
    render(<IdleShowGuard />)
    await wait(IDLE_MS + 1000)
    expect(question()).toBeInTheDocument()
  })

  it("never checks before the plan is known", async () => {
    plan = null
    render(<IdleShowGuard />)
    await wait(IDLE_MS + WARN_MS + MIN)
    expect(question()).toBeNull()
  })
})
