import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";


/**
 * Dashboard guardrails (docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md, R6).
 *
 * Dashboard code draws with the design-system tokens in app/dashboard.css and
 * the components in components/ds. These rules stop one-off values creeping
 * back in, which is how the first round ended up with a 34px heading written
 * out by hand on every page.
 *
 *   - No arbitrary values for type, colour, radius, tracking, line height,
 *     shadow or stroke (`text-[13px]`, `rounded-[14px]`, `bg-[#…]`), and no
 *     pixel sizes in brackets (`size-[52px]`). Layout brackets stay legal:
 *     grid templates, `max-w-[65ch]`, `max-h-[50vh]`, calc() with safe-area
 *     insets, flex-basis, transition lists.
 *   - No Tailwind default radius steps (`rounded-xl`) or default palette
 *     colours (`text-zinc-400`): the tokens are the scale.
 *   - No HTML entities in JSX text (`you&apos;re`): write the character
 *     (’ — “ ” …). An entity in the text after an {expression} makes the
 *     compiler drop the space before it ("Keep Morning Staticon air").
 *   - No components/ui import where components/ds has the part. The five
 *     allowed have no kit equivalent and carry no dashboard overrides.
 */
const DASHBOARD_FILES = ["app/dashboard/**/*.{ts,tsx}", "components/dashboard/**/*.{ts,tsx}", "components/ds/**/*.{ts,tsx}", "components/studio/**/*.{ts,tsx}"]

const ARBITRARY_DESIGN_VALUE =
  "(^|[\\s:\"'`])-?(text|bg|border(-[trblxy])?|rounded(-[trblse]{1,2})?|tracking|leading|font|shadow|inset-shadow|ring|inset-ring|outline|decoration|fill|stroke)-\\[|-\\[-?\\d+(\\.\\d+)?px\\]"
const DEFAULT_RADIUS = "(^|[\\s:\"'`])rounded(-[trblse]{1,2})?-(sm|md|lg|xl|2xl|3xl|4xl)(?![\\w-])"
const DEFAULT_PALETTE =
  "(^|[\\s:\"'`])(text|bg|border|ring|fill|stroke|from|to|via|outline|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b"

const classRule = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
]

const dashboardGuardrails = {
  files: DASHBOARD_FILES,
  ignores: ["**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...classRule(ARBITRARY_DESIGN_VALUE, "Use a design token (app/dashboard.css), not an arbitrary value. Add a token if none fits."),
      ...classRule(DEFAULT_RADIUS, "Use a radius token (rounded-card, rounded-control, rounded-item…), not Tailwind's default steps."),
      ...classRule(DEFAULT_PALETTE, "Use a role colour (text-muted-foreground, bg-live, text-fault-text…), not Tailwind's palette."),
      {
        selector: "JSXText[raw=/&[a-zA-Z0-9#]+;/]",
        message: "Write the character (’ — “ ” …), not an HTML entity: an entity after an {expression} drops the space before it.",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: "^@/components/ui/(?!(skeleton|sidebar|slider|scroll-area|avatar)$)",
            message: "Dashboard code uses components/ds. components/ui is the marketing kit.",
          },
        ],
      },
    ],
  },
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  dashboardGuardrails,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party / vendored bundles served as static assets.
    "public/**",
  ]),
]);

export default eslintConfig;
