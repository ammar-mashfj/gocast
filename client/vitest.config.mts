import { defineConfig } from "vitest/config"

// Unit and component tests, colocated as *.test.ts(x). Browser flows live in
// tests/e2e (Playwright) and are not run here.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**"],
    css: false,
  },
})
