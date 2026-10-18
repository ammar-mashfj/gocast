import { defineConfig, devices } from "@playwright/test"

/**
 * The pre-merge sweep: every page on six screens, desktop down to a small
 * phone, with touch on for the tablets and phones. Runs against the dev
 * servers that are already up (never starts its own).
 *
 *   npx playwright test -c playwright.sweep.config.ts
 *   → tests/e2e/.sweep/<device>/<page>.png + results.jsonl
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

const touch = { isMobile: true, hasTouch: true, deviceScaleFactor: 1 }

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /pr-sweep\.spec\.ts|pr-flows\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [["list"], ["json", { outputFile: "tests/e2e/.sweep/report.json" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "tablet-landscape", use: { ...devices["Desktop Chrome"], ...touch, viewport: { width: 1180, height: 820 } } },
    { name: "tablet-portrait", use: { ...devices["Desktop Chrome"], ...touch, viewport: { width: 820, height: 1180 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], ...touch, viewport: { width: 390, height: 844 } } },
    { name: "phone-small", use: { ...devices["Desktop Chrome"], ...touch, viewport: { width: 360, height: 740 } } },
  ],
})
