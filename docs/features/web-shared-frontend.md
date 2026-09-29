---
feature: Web app shared frontend layer (Next.js shell, config, providers, hooks, UI kit)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - client/package.json
  - client/next.config.ts
  - client/tsconfig.json
  - client/eslint.config.mjs
  - client/postcss.config.mjs
  - client/components.json
  - client/playwright.config.ts
  - client/.env.example
  - client/proxy.ts
  - client/instrumentation.ts
  - client/instrumentation-client.ts
  - client/sentry.server.config.ts
  - client/sentry.edge.config.ts
  - client/app/layout.tsx
  - client/app/globals.css
  - client/app/not-found.tsx
  - client/app/error.tsx
  - client/app/global-error.tsx
  - client/app/manifest.ts
  - client/app/robots.ts
  - client/app/dashboard/layout.tsx
  - client/app/dashboard/error.tsx
  - client/app/dashboard/settings/layout.tsx
  - client/app/auth/layout.tsx
  - client/app/(marketing)/layout.tsx
  - client/app/hls-proxy/[...path]/route.ts
  - client/app/station/[slug]/getStation.ts
  - client/actions/auth.ts
  - client/lib/env.ts
  - client/lib/axios.ts
  - client/lib/api-server.ts
  - client/lib/public-api.ts
  - client/lib/station-server.ts
  - client/lib/session.ts
  - client/lib/cookies.ts
  - client/lib/utils.ts
  - client/lib/format.ts
  - client/lib/programme.ts
  - client/lib/echo.ts
  - client/lib/notifications.ts
  - client/lib/embed.ts
  - client/lib/seo.ts
  - client/lib/hlsRecovery.ts
  - client/interfaces/User.ts
  - client/interfaces/Plan.ts
  - client/interfaces/Station.ts
  - client/interfaces/StationStatus.ts
  - client/interfaces/StreamSession.ts
  - client/interfaces/Playlist.ts
  - client/interfaces/Track.ts
  - client/interfaces/Audience.ts
  - client/interfaces/Notification.ts
  - client/contexts/AccountContext.tsx
  - client/contexts/StationContext.tsx
  - client/contexts/ProRequestContext.tsx
  - client/contexts/RealtimeContext.tsx
  - client/contexts/BroadcastContext.tsx
  - client/hooks/useStationStatus.ts
  - client/hooks/usePublicStationStats.ts
  - client/hooks/useListenerCount.ts
  - client/hooks/useListenerSession.ts
  - client/hooks/useBroadcastStats.ts
  - client/hooks/useNotifications.ts
  - client/hooks/useStreamPlayback.ts
  - client/hooks/useTrackProgress.ts
  - client/hooks/useSignOut.ts
  - client/hooks/useDocumentTitle.ts
  - client/hooks/useMounted.ts
  - client/hooks/use-mobile.ts
  - client/components/ui/button.tsx
  - client/components/ui/badge.tsx
  - client/components/ui/card.tsx
  - client/components/ui/dialog.tsx
  - client/components/ui/sheet.tsx
  - client/components/ui/sidebar.tsx
  - client/components/ui/select.tsx
  - client/components/ui/slider.tsx
  - client/components/ui/tooltip.tsx
  - client/components/ui/sonner.tsx
  - client/components/ui/use-confirm.tsx
  - client/components/ui/input.tsx
  - client/components/ui/textarea.tsx
  - client/components/ui/switch.tsx
  - client/components/ui/empty.tsx
  - client/components/ui/popover.tsx
  - client/components/ui/skeleton.tsx
  - client/components/ui/avatar.tsx
  - api/app/Http/Middleware/UseAuthTokenCookie.php
  - api/config/cors.php
fingerprint: 5a518b28afa1a9c9
---

# Web app shared frontend layer

The cross-cutting part of `client/` (Next 16.2.3, React 19.2.4, Tailwind 4, TypeScript strict): build and runtime config, the auth-cookie gate, the root layout, the design tokens, the UI kit, the provider tree, the shared hooks, and the two ways the app talks to the Laravel API. Feature behaviour lives in the feature docs ([auth](auth.md), [station lifecycle](station-lifecycle.md), [broadcasting web studio](broadcasting-web-studio.md), [public player and embed](public-player-and-embed.md), [realtime events](realtime-events.md), [listener analytics](listener-analytics.md), [notifications and email](notifications-and-email.md), [station management dashboard](station-management-dashboard.md), [marketing site](marketing-site-help-blog.md)). This doc says how the shared pieces behave and which of them lie about themselves.

The one thing people get wrong: **the browser never holds a readable auth token.** The API sets `token` as an HttpOnly cookie, so the axios interceptor's `getCookie("token")` returns null and the `Authorization` header is only added for legacy non-HttpOnly sessions. Real browser requests authenticate because `withCredentials: true` sends the cookie and the API's `UseAuthTokenCookie` middleware turns it into a bearer header (only when the request has no bearer already; with duplicate `token` cookies it uses the last one and emits an expiring Set-Cookie for the legacy host-only copy). CORS: `api/config/cors.php` allows paths `api/*`, `sanctum/csrf-cookie`, `broadcasting/auth`, origins from `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173,http://localhost:3000`), `supports_credentials` true. Server components authenticate a different way: `apiFetch` reads the same cookie through `next/headers` and sets the header itself. The second thing people get wrong: **there is no light mode and no theme switch**, whatever the `:root` tokens and `next-themes` in `package.json` suggest.

## Tooling and scripts

| Item | Value | Source |
|---|---|---|
| Scripts | `dev` (`next dev`), `build`, `start`, `lint` (`eslint`), `analyze` (`ANALYZE=true next build`), `test:e2e`, `test:e2e:ui` (Playwright) | `package.json` |
| Runtime deps of note | `@sentry/nextjs`, `axios`, `hls.js`, `laravel-echo` + `pusher-js`, `radix-ui` (single umbrella package), `sonner`, `next-themes`, `class-variance-authority`, `tailwind-merge`, `clsx`, `@dnd-kit/*`, `music-metadata`, `qrcode.react`, `lucide-react`, `@tabler/icons-react`, `tw-animate-css` | `package.json` |
| Dev deps | `@next/bundle-analyzer`, `@playwright/test`, `@tailwindcss/postcss`, `@tailwindcss/typography`, `shadcn`, `eslint` 9 + `eslint-config-next` 16.2.3 | `package.json` |
| TypeScript | `strict`, `moduleResolution: bundler`, `noEmit`, target ES2017, path alias `@/*` -> `./*` | `tsconfig.json` |
| ESLint | flat config: `core-web-vitals` + `typescript` presets; ignores `.next`, `out`, `build`, `next-env.d.ts`, `public/**` | `eslint.config.mjs` |
| PostCSS | one plugin, `@tailwindcss/postcss`. No `tailwind.config` file: Tailwind 4, all tokens are in CSS (`components.json` has `"config": ""`) | `postcss.config.mjs` |
| shadcn | style `radix-mira`, base colour neutral, CSS variables, icon library `lucide`, RSC on, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks` | `components.json` |
| Agent rule | `client/AGENTS.md` (via `CLAUDE.md`) says this Next has breaking changes and to read `node_modules/next/dist/docs/` first | `client/CLAUDE.md` |

`proxy.ts` (not `middleware.ts`) is Next 16's renamed middleware file convention; it exports `proxy()` and a `config.matcher`.

## next.config.ts

- `turbopack.root = __dirname`, so a stray `package-lock.json` in a parent directory (home dir) cannot become the workspace root.
- `output: "standalone"`, `compress: true`.
- `allowedDevOrigins`: `10.*.*.*`, `192.168.*.*`, sixteen explicit `172.16..31.*.*` entries (the matcher only treats a whole dot segment as a wildcard, so `172.1*` matches nothing) and `*.local`. Dev only. Without it a phone or tablet on the LAN gets SSR HTML but 403s every client chunk, so every button is dead.
- `images`: formats avif + webp. `unoptimized` and `dangerouslyAllowLocalIP` are both `NODE_ENV === "development"`. `remotePatterns`: `https://<host of NEXT_PUBLIC_API_URL, fallback api.gocast.fm>/storage/**`, `https://lh3.googleusercontent.com/**` (Google avatars), `http://localhost:8000/storage/**`. The API host is evaluated at config load time, so it is baked at build.
- `rewrites()`: only in development, `/stream-proxy/:path*` -> `INTERNAL_ICECAST_URL` (default `http://127.0.0.1:8888`). In production it returns `[]`.
- `redirects()`: `/discover` -> `/` (307, temporary; the `app/discover` files are kept), `/roadmap` -> `/` (308, permanent, page deleted).
- `headers()`: every path except `/embed/...` gets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. The source regex is `/((?!embed/).*)`. `/embed/:path*` gets only nosniff + referrer policy and deliberately no frame header and no `frame-ancestors`. There is no CSP anywhere.
- Wrapped as `withSentryConfig(withBundleAnalyzer(nextConfig), {...})`: org `gocast`, project `javascript-nextjs`, `silent: !process.env.CI`, `widenClientFileUpload`, `tunnelRoute: "/monitoring"` (browser reports go through a Next rewrite), and under `webpack:` `automaticVercelMonitors: true` and `treeshake.removeDebugLogging`. `infra/native/deploy-native.sh` `build_client()` passes `SENTRY_AUTH_TOKEN` (default empty) and `NEXT_PUBLIC_SENTRY_DSN` into `npm run build`; source-map upload itself is Sentry plugin behaviour, not readable here.

## Route protection: proxy.ts

`proxy(request)` runs on every path the matcher accepts: `/((?!api|embed|_next/static|_next/image|.*\.png$|.*\.svg$).*)`. Note the exclusions are prefix matches with no segment boundary (`/apiary`, `/embedding` are also skipped), and `/monitoring`, `/hls-proxy`, `/stream-proxy` are matched but harmless.

It reads two cookies: `token` (presence only) and `user` (URL-decoded JSON, must have a truthy `email_verified_at`; a parse failure counts as unverified).

| Path prefix | Condition | Result |
|---|---|---|
| `/auth/login`, `/auth/register` | token present and user verified | redirect to `/dashboard/stations` |
| `/dashboard` | no token, or user cookie missing/unverified | redirect to `/auth/login` |
| anything else | | `NextResponse.next()` |

This is a UX gate, not security: it trusts a client-writable `user` cookie and only checks the token exists, not that it is valid. The real gates are the API (Sanctum) and the dashboard layout (below). Other `/auth/*` routes (callback, verify, reset) are never redirected away.

## Root layout (app/layout.tsx)

- Server component. Fonts (all `next/font/google`): `body` and `display` are **both** `Bricolage_Grotesque` (latin, `opsz` axis, `display: swap`) bound to `--font-body` and `--font-display-face`; `mono` is IBM Plex Mono 400-700 (`--font-mono-face`, `preload: false`); IBM Plex Sans (latin + cyrillic) and IBM Plex Sans Arabic (`--font-plex-sans`, `--font-plex-arabic`, both `preload: false`) are glyph fallbacks for non-Latin station and track names. `globals.css` maps them to Tailwind `--font-sans`, `--font-display`, `--font-heading`, `--font-mono`. The previous body face was Onest and mono JetBrains Mono (per the layout comment); roll back by restoring those two constructors.
- `<html lang="en" class="dark h-full antialiased font-sans ...font variables">`. The `dark` class is hardcoded. `<body class="min-h-full flex flex-col">` renders `{children}` and one `<Toaster />`.
- Metadata: `metadataBase` from `env.appUrl` (undefined if unset), title default "GoCast — Start an Internet Radio Station in Your Browser" with template `%s — GoCast`, OG and Twitter cards using `DEFAULT_OG_IMAGE` (`/og-image.jpg`, 1731x909), `@gocastfm`. No `alternates` on purpose (a root canonical of `/` marked every inheriting page a duplicate of the homepage). Viewport: `themeColor #8b5cf6`, `colorScheme: "dark"`.
- **Production-only** (`NODE_ENV === "production"`), all `afterInteractive`: Umami (`cloud.umami.is`, website id in source), Google Analytics gtag (`G-44FJYHJWQR`), Microsoft Clarity (`clarity.ms`, project id in source), and an Organization + WebSite + SoftwareApplication JSON-LD block in `<body>` (with `<` escaped to `<`). All four load for every route including `/dashboard`. No consent banner exists in the code.
- Not present in the root layout: no theme provider, no `TooltipProvider`, no auth or query providers. Providers exist only under `/dashboard`.
- Static route handlers: `manifest.ts` (standalone PWA, `portrait-primary`, categories music/entertainment, `#08080d` background, `#8b5cf6` theme, `icon.svg` + `apple-icon.png`), `robots.ts` (allow `/`; disallow `/dashboard/`, `/api/`, `/monitoring`, `/hls-proxy/`, `/stream-proxy/`; `/auth/` and `/embed/` deliberately not disallowed so their noindex can be seen; sitemaps `/sitemap.xml` and `/station/sitemap.xml`).

## Error and not-found surfaces

| File | Kind | Behaviour |
|---|---|---|
| `app/not-found.tsx` | server | Logo, decorative 404, real `<h1>` "Page not found", link home. Metadata `robots: noindex, follow`. |
| `app/dashboard/settings/layout.tsx` | server | Pass-through that only sets the tab title "Account" (its page is a client component). |
| `app/error.tsx` | client boundary | Card with `error.message` (or a generic line) and a "Try again" button that calls `reset()`. Shows the raw message to the visitor. Does not report to Sentry itself. |
| `app/global-error.tsx` | client | Calls `Sentry.captureException` in an effect and renders Next's stock `NextError` with `statusCode={0}` inside its own `<html>`. |
| `app/dashboard/error.tsx` | client, inside the dashboard layout | Heading "This page didn't load". Reads `useBroadcast()`: if `live` or `reconnecting` it says the broadcast is still on air and links back to `/dashboard/stations/{stationSlug}/studio`; otherwise links to `/dashboard`. Uses `unstable_retry` (Next 16), because `reset()` does not refetch. Raw message and `digest` only inside a "Details for support" `<details>`. `console.error` only, no Sentry call of its own. |
| `loading.tsx` | | Exist for `broadcasts`, and for the station `(overview)`, `audience`, `library`, `schedule`, `settings` pages, plus `discover`. |

## Design tokens and theming (app/globals.css)

- Imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, plugin `@tailwindcss/typography`. `@custom-variant dark (&:is(.dark *))`.
- **Two token sets, one in use.** `:root` holds an oklch light palette (`color-scheme: light`); `.dark` holds the real palette: background `#08080d`, card `#101018`, popover `#13131d`, primary `#7f4ff0` (deliberately darker than brand violet `#8b5cf6` for AA with white text), ring `#c4b5fd`, border `rgb(255 255 255 / 9%)`, input 13%, sidebar `#0b0b12`. Because `<html>` always has `class="dark"` and nothing removes it, the light set is dead in practice. A stray `html, body, #root { background: #08080d }` rule also hardcodes the ground.
- `next-themes` is imported in exactly one place, `components/ui/sonner.tsx` (`useTheme()`), and there is no `ThemeProvider`. With no provider `theme` is undefined and falls to `"system"`, so Sonner follows the OS light/dark preference while the page is always dark; the toast surface is forced onto the popover tokens via `--normal-bg`, `--normal-text`, `--normal-border`, so it mostly looks right.
- Brand and state tokens (`@theme inline`): `violet-full #8b5cf6`, `violet-muted #a78bfa`, `violet #c4b5fd`, `violet-subtle #1f1145`, `emerald-live`, `text-primary/secondary/muted/faint`, `border-subtle`, `dark #08080d`, `panel #101018`. State vocabulary, one meaning each: `live` (emerald, a human is broadcasting), `on-air` (violet, AutoDJ), `mic` (sky), `fault` (= `--destructive`, red, reserved for faults), `pro` (amber), with `-text` variants for `live`, `mic`, `fault`, `pro`. Radius scale is derived from `--radius: 0.625rem`.
- Utilities: `.lamp-settle`, `.signoff-rise`, `--animate-indeterminate` (the encoder panel's unknown-length wait), `--ease-out-expo`, view-transition duration 260ms for queue-row moves (root transition disabled), all motion removed under `prefers-reduced-motion`.
- `.sheet` and `.sheet-rules`: inside `.sheet` a `[data-slot="card"]` loses its fill, ring, radius and padding (unlayered CSS on purpose, to beat the Card utilities); `.sheet-rules > card:not(:first-child)` gets a 7% white hairline top border. Dialogs portal out, so their cards keep chrome.
- `html[data-mini-controller] [data-sonner-toaster]` lifts toasts to 96px (mobile `88px + safe-area`) with `!important`, to clear the broadcast mini controller. Who sets `data-mini-controller` is in the dashboard components, not here.
- Font tokens are described under Root layout.

## UI kit (components/ui)

shadcn "radix-mira" wrappers over the single `radix-ui` package, edited locally. All carry `data-slot` attributes that CSS such as `.sheet` targets. Customisations that differ from stock are noted.

| File | Exports | Notes |
|---|---|---|
| `button.tsx` | `Button`, `buttonVariants` | variants `default`, `outline`, `secondary`, `ghost`, `destructive` (tinted, not solid red), `link` (violet-muted); sizes `default` h-9, `xs` h-6, `sm` h-8, `lg` h-10, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. Sizes were bumped one step for the 36px touch target. `asChild` via Slot. |
| `badge.tsx` | `Badge`, `badgeVariants` | variants `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, and custom `pro` (amber plan tag, uppercase). |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | `size` default/sm. `CardTitle` uses `font-heading` (token added in globals.css; it used to be undefined). Neutralised inside `.sheet`. |
| `dialog.tsx` | `Dialog` + Trigger, Portal, Close, Overlay, Content, Header, Footer, Title, Description | Overlay `bg-black/80`; content max height `100dvh - 2rem`, scrolls; `showCloseButton` prop. |
| `sheet.tsx` | `Sheet` + parts | `side` top/right/bottom/left; used for the mobile sidebar. |
| `sidebar.tsx` | `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger`, `SidebarRail`, header/footer/content/group/menu/menu-button/menu-sub parts, `useSidebar` | width 16rem (18rem mobile, 3rem icon), toggle shortcut Ctrl/Cmd+B, mobile renders a `Sheet`. See the `sidebar_state` trap. Mobile breakpoint 768px via `useIsMobile`. |
| `select.tsx` | `Select<T>`, `SelectOption<T>` | **Not** the shadcn Select: a hand-built combobox/listbox (h-8 trigger, arrow keys, Enter/Space commit, outside-pointer close) so the popup obeys the theme. Escape is caught in a window capture listener so it closes only the list, not the surrounding Radix dialog. Used by the library screens (`PlaylistView`, `JinglesDialog`, `AllTracksView`). |
| `slider.tsx` | `Slider` | Radix slider; one thumb per value. |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | provider default `delayDuration` 0. |
| `sonner.tsx` | `Toaster` | see theming above; lucide icons per level; toast class `cn-toast`. |
| `use-confirm.tsx` | `useConfirm()` | returns `[confirm(options) => Promise<boolean>, element]`. Render `element` once. A second ask while one is open resolves the first with false. Options: `title`, `description`, `confirmLabel`, `cancelLabel`, `destructive`. Replaces `window.confirm`. |
| `input.tsx`, `textarea.tsx`, `label.tsx`, `switch.tsx`, `separator.tsx`, `skeleton.tsx` (`motion-reduce:animate-none`), `avatar.tsx` (+ `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount`), `popover.tsx` (+ Header/Title/Description), `empty.tsx` (`Empty*`), `scroll-area.tsx` | | thin wrappers; Input is h-9 with the reverse-responsive text shrink removed. |
| `dropdown-menu.tsx`, `field.tsx` (`Field*`, `FieldError` dedupes messages), `breadcrumb.tsx`, `navigation-menu.tsx` | | stock shadcn-style wrappers, only skimmed for this doc. |

Other component folders (`components/dashboard`, `homepage`, `studio`, `auth`, `common`, `content`, `ProAccessDialog.tsx`, `StationArtwork.tsx`) are feature code and are covered by their feature docs.

## Talking to the API

| | Browser (client components) | Server (server components, route handlers) |
|---|---|---|
| Module | `lib/axios.ts` default export `api` | `lib/api-server.ts` `apiFetch<T>(path, options?)` |
| Base URL | `env.apiUrl` (see env) | `INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL` (read at import) |
| Auth | `withCredentials: true` (cookie); request interceptor adds `Authorization: Bearer <token>` only if a JS-readable `token` cookie exists (legacy) | reads `token` via `cookies()` and sets `Authorization` |
| Cache | n/a | `cache: "no-store"`, always |
| Timeout | none set on axios | `AbortSignal.timeout(10_000)` unless the caller passes a signal |
| Errors | rejects with axios error | `ApiFetchError(status, path, body)` on non-2xx (message includes first 200 chars of body); `ApiTimeoutError(path, 10000)` on timeout/abort (a plain Error, because a raw `DOMException` crashes React's RSC error transport) |
| Headers | JSON + `Accept: application/json` | same, plus caller's overrides |

`api` response interceptor, browser only: a **401** on any URL not containing `/login` or `/register` calls `clearAuth()` and does `window.location.href = "/auth/login?expired=1"` once (module flag `expiredRedirectInFlight`, never reset because the page reloads). A **403 with `data.code === "email_unverified"`** shows the toast "Verify your email to continue." and still rejects. Callers still see the rejection in both cases.

**Public, unauthenticated reads** (station pages, homepage rail, sitemap, embed) use plain `fetch` with `publicApiHeaders()` (`lib/public-api.ts`): `Accept` plus `X-Render-Key: $RENDER_API_KEY` when set, which lifts the API's 60/min per-IP limit for the Next server. Users: `app/station/[slug]/getStation.ts`, `app/embed/[slug]/page.tsx`, `app/station/sitemap.ts`, `components/homepage/LiveNow.tsx`, `components/homepage/heroSection/HeroSection.tsx`. `getStation` returns null only on 404 (real 404 for search engines), throws on anything else, caches with `next: { revalidate: 60 }` in production (`no-store`, 2 attempts, 3s timeout in dev because of stale keep-alive sockets).

Client-side public calls (`usePublicStationStats`, `useListenerSession`) use bare `fetch` against `${env.apiUrl}/public/...` with no credentials.

`lib/station-server.ts` `getMyStation()` (React `cache`, one server render): `GET /stations`, sorts by `created_at`, returns the **oldest** or null. "A user has one station" is enforced here, not by the API, which still returns a collection.

`lib/session.ts` `getSession()`: requires **both** `token` and a parseable `user` cookie, else null (a malformed cookie must not throw in the marketing layout). `isAuthenticated()` wraps it. `actions/auth.ts` is **not** a server action file (no `"use server"`; it is client helpers): `saveAuth(_token, user)` ignores the token and writes the `user` cookie with `plan` stripped; `getToken`, `getUser` (unguarded `JSON.parse`), `clearAuth` (removes `token` and `user`, which cannot remove an HttpOnly token; real logout is `POST /logout`). `lib/cookies.ts`: `setCookie(name, value, days = 7)` adds `path=/; SameSite=Lax` and `Secure` when the page was loaded over https (evaluated once at module load).

## Environment variables

`lib/env.ts` exposes getters; each `process.env.NEXT_PUBLIC_*` is a literal access so the bundler can inline it.

| Variable | Scope | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | build (inlined) | `env.apiUrl`, `api-server.ts` fallback, `next.config.ts` image host | Laravel base including `/api`. Server side prefers `INTERNAL_API_URL`. |
| `INTERNAL_API_URL` | server | `env.apiUrl` (only when `window` is undefined), `api-server.ts` | Container-network URL. Not in `.env.example`. |
| `NEXT_PUBLIC_APP_URL` | build | `env.appUrl`: metadataBase, JSON-LD, robots, embed URLs, notification link origin fallback | Empty gives `undefined/#organization` ids in JSON-LD. |
| `NEXT_PUBLIC_ICECAST_URL` | build | `env.icecastUrl`: Icecast fallback URL in `PlayerView`, `EmbedPlayer`, `HeroStationPlayer` | `.env.example` default `http://localhost:8888` (Icecast direct, not the `/stream-proxy` rewrite); `deploy-native.sh` sets `https://${ICECAST_HOST}`. Callers append `station.icecast_mount`. |
| `INTERNAL_ICECAST_URL` | server, dev | `next.config.ts` rewrite | default `http://127.0.0.1:8888`. |
| `RENDER_API_KEY` | server | `publicApiHeaders()` | must equal the API's value. Optional locally. |
| `NEXT_PUBLIC_PUSHER_KEY` | build | `env.broadcastKey` | **Client kill switch**: empty -> `getEcho()` returns null, no socket, everything polls. |
| `NEXT_PUBLIC_PUSHER_HOST` / `_PORT` | build | Echo `wsHost`; port defaults 443 | Ably's Pusher-protocol host. |
| `NEXT_PUBLIC_BROADCAST_AUTH_URL` | build | Echo private-channel auth endpoint | a sibling of `/api`, so its own variable. |
| `NEXT_PUBLIC_SENTRY_DSN` | build | all three Sentry inits | Sentry only initialises when `NODE_ENV === "production"` **and** the DSN is set. |
| `LIQUIDSOAP_HLS_DIR` | server, dev | `app/hls-proxy` | default `/var/gocast/hls`. |
| `ANALYZE`, `CI` | build | bundle analyzer, Sentry `silent`, Playwright | |
| `E2E_BASE_URL`, `E2E_API_URL` | test | `playwright.config.ts` | default `localhost:3000` / `localhost:8000`. |
| `NODE_ENV` | | many dev-only branches (below) | |

`NEXT_PUBLIC_*` values are frozen at build; `deploy-native.sh` feeds them from `infra/native/env/domains.env` (see [deployment-infra](deployment-infra.md)). The dev-only branches keyed on `NODE_ENV === "development"`: image optimizer off, local-IP images allowed, `/stream-proxy` rewrite, `/hls-proxy` route (404 otherwise), `getStation` retry/no-cache, embed page equivalent.

## Sentry

`instrumentation.ts` loads `sentry.server.config` (nodejs runtime) or `sentry.edge.config` (edge) and exports `onRequestError = Sentry.captureRequestError`. All three inits are gated on production + DSN, `tracesSampleRate 0.2`, `enableLogs`, `sendDefaultPii: false`. The browser init also adds `replayIntegration()` (session sample 0.02, on-error 0.5), `denyUrls: [/^app:\/\//]` and ignores `Java object is gone`, `Object Not Found Matching Id:\d+` (Outlook Safe Links), `xbrowser is not defined`. Browser reports tunnel through `/monitoring`. `onRouterTransitionStart = Sentry.captureRouterTransitionStart`.

`instrumentation-client.ts` also monkey-patches `Node.prototype.removeChild` and `insertBefore` (guarded by `__translateSafe`, runs in every environment): if the child was moved by browser page translation (Google Translate wraps text in `<font>`), `removeChild` becomes a `console.warn` no-op and `insertBefore` appends instead of throwing `NotFoundError`. Trade-off: translated text can go stale. This is why some components wrap conditional text in keyed spans.

## Providers (dashboard only)

Everything below is mounted by `app/dashboard/layout.tsx`, a server component. It reads `token` and `user` cookies, redirects to `/auth/login` if either is missing or `email_verified_at` is falsy, then in parallel: `apiFetch GET /user` (-> `Account {email, plan}`; on failure logs and falls back to `{email: cookieEmail, plan: null}`) and `getMyStation()` (-> `CurrentStation`; failure logs and gives null). Metadata is `robots: noindex, nofollow`, title template `%s — GoCast`. Tree, outermost first:

`RealtimeProvider(userId)` > `BroadcastProvider` > `AccountProvider(account)` > `ProRequestProvider` > `StationProvider(station)` > `SidebarProvider` > `AppSidebar`, `SidebarInset` { `DashboardHeader`, `LiveBanner`, `<main class="flex-1 p-6">`, `BroadcastMiniController` }.

| Context | Holds | Hooks | Notes |
|---|---|---|---|
| `RealtimeContext` | `{connected, onStationSignal(handler) => unsubscribe}` | `useRealtime()` (null outside the provider) | One Echo socket per tab, one private channel `user.{id}` listening to `.station.state`. `connected` is true only when the channel is **subscribed** and the socket state is `connected` (a 401 on auth leaves the socket up but `connected` false). Handlers live in a ref'd Set so mounting components never resubscribe. Cleanup uses `echo.leaveChannel("private-user.{id}")`, not `leave()` or `disconnect()`. Signals carry `{slug, event, at}`, never state. The `userId` prop is the `user` cookie's id. |
| `BroadcastContext` | `state`, `stationSlug`, `steps`, `error`, `micStream`, `micDisabled`, `engine`, `liveSince`, `getTransportStats()`, `start(stationId, opts)`, `stop({releaseStation?})` | `useBroadcast()` (throws outside), `useBroadcastOptional()` (null outside) | Owns the `BroadcastManager` (`lib/broadcast.ts`). `start` is guarded by `startingRef` (double click / StrictMode would otherwise open two sockets and lose the harbor mount). `liveSince` is set once on first `live`. First-ever go-live fires a one-time toast via `fireOnce("broadcaster:first-live")`. `beforeunload` prompt while `live` or `reconnecting`. While an engine exists, any `pointerdown` or `keydown` resumes a suspended AudioContext. `stop()` also clears the `broadcast:micDisabled:{slug}` localStorage key. `stop({releaseStation:true})` (for accounts without AutoDJ; the caller decides) calls `POST /stations/{slug}/stop`, retrying at 0, 400, 800, 1500, 2500 ms only while the API answers 409, because harbor's `live_disconnected` lands after the socket closes. Details in [broadcasting-web-studio](broadcasting-web-studio.md). |
| `AccountContext` | `Account {email, plan: Plan \| null}` | `useAccount`, `usePlan`, `useAutoDjLocked`, `useAudienceLocked` (`analytics_days <= 0`), `useEmbedLocked`, `useEncoderLocked` | Null plan means "don't know", never "free": every `*Locked` hook returns false for a null plan, so an unknown plan renders unlocked. They only drive badges and upsells; the API enforces. Fetched once per layout render, not refreshed client-side. |
| `ProRequestContext` | `{open(), requested}` | `useProRequest()` | Mounts `ProAccessDialog` (plan "pro", prefilled with account email) once. `requested` is in-memory, resets on reload. Default context value is a no-op, so a consumer outside the provider silently does nothing. |
| `StationContext` | `CurrentStation {slug, name, artwork_url, genre, description}` | `useCurrentStation()`, `useStationBySlug(slug)` | Identity only, no live state. `useStationBySlug` returns null when the route slug is not the oldest station's slug. |

`useSidebar()` (in `ui/sidebar.tsx`) is a sixth context, internal to the sidebar.

## Hooks

All are client-only. "Visible" means `document.hidden` is false.

| Hook | Inputs | Timing and cleanup |
|---|---|---|
| `useStationStatus(slug, enabled = true, intervalMs?)` -> `{status, loading, refresh}` | slug; optional fixed cadence override | Polls `GET /stations/{slug}/status` via axios. Pacing (`intervalFor`): no status yet 2s; `starting` 2s (even with push); `offline` 30s; `reachable` and (`source === "live"` with `broadcaster === false`, or `broadcaster === true` with `source !== "live"`) (handover windows) 2s; otherwise ceiling 10s (30s when the socket is `connected`), shortened to `remaining*1000 + 750ms` with a 3s floor when a track length is known. Failures back off `2s * 2^(n-1)` capped at 30s, reset on success. Hidden tab: no reads, loop keeps ticking, but the pace is computed from the `status` captured when the effect last (re)ran, so it can be the 2s no-status pace until a visibility restore; visibility restore restarts the loop with an immediate read. Realtime signals for this slug (dropped if `at` is strictly older than the last seen) restart the loop after a 120ms coalesce, not when hidden. A `generation` counter retires in-flight ticks so restarts never leave orphan loops. `intervalMs` override is ignored while push is connected. Cleanup clears timers and listeners and unsubscribes. |
| `useTrackProgress(status)` -> `() => {elapsed, duration} \| null` | status | No state: anchors a local clock from `elapsed`/`remaining`; re-anchors on a new track (JSON of title+artist), first reading, or drift over 2.5s; null when `remaining` is null or negative (live, silence). The caller reads it per animation frame. Clamps at duration, never wraps. |
| `usePublicStationFeed(slug, onUpdate, {enabled, pauseWhenHidden})` and `usePublicStationStats(slug, opts)` -> stats or null | | Module-level registry: one feed, one 10s `setInterval` and one in-flight request per slug per tab, shared by all subscribers; late subscribers get the held value at once. Reads `GET {apiUrl}/public/stations/{slug}/listeners` with plain fetch, silently ignoring failures and non-2xx. Normalises to `{count, is_live, is_on_air, now_playing{title,artist}}` (blank strings become null). Pauses when hidden unless some subscriber passes `pauseWhenHidden: false`; on becoming visible it re-reads only if the held value is 10s or older. A feed is deleted when its last subscriber leaves. |
| `useListenerCount(slug, enabled)` -> number \| null | | Thin wrapper over `usePublicStationStats`. |
| `useBroadcastStats(slug, isLive)` -> `{elapsed, listeners, peak, history, startedAt}` | | Session data in a module `Map` keyed `slug:liveSince` so it survives the studio unmounting. `elapsed` derived from `liveSince` every 1s. Subscribes to the public feed with `pauseWhenHidden: false` (the only such caller). History keeps 24 samples, one per read, samples closer than 5s to the last are ignored. Fires listener-milestone toasts once per threshold per show (`LISTENER_MILESTONES` in `lib/milestones.ts`). Also exports `getSessionPeak(slug, liveSince)` for the end-of-show summary. |
| `useListenerSession(slug, playing, transport)` | `transport` `"hls"`/`"icecast"`/null | Only acts when `playing` and transport is resolved. `POST /public/stations/{slug}/listen {transport}` -> token and `beat_every` (fallback 15s); beats `POST /public/listen/{token}/beat` on that interval (`keepalive`); on `pagehide` and on cleanup sends `navigator.sendBeacon(.../end)` (or a fetch fallback). All failures silent. Semantics in [listener analytics](listener-analytics.md). |
| `useStreamPlayback({hlsUrl, icecastUrl})` -> `{audioRef, playing, loading, transport, inband, toggle, stop}` | | Drives one `<audio>` through hls.js -> native HLS -> Icecast. hls.js is dynamically imported on first play. Config: `backBufferLength 30`, `liveSyncDurationCount 2`, deferring `pLoader`. Fatal network errors use `createNetworkRecovery` (up to 5 retries, `1s * 2^attempt`, resets on each loaded level, then Icecast); fatal media errors `recoverMediaError()`; anything else falls to Icecast. `playing` comes from element events, not from the call to `play()`. Reads ID3 (`TIT2`, `TPE1`, `StreamTitle`) from a `metadata` text track. Cleanup destroys hls. Also exports `parseStreamTitle` ("Artist - Title" split; placeholder values such as `unknown`, `n/a`, `-` become null). Used only by `EmbedPlayer`; `PlayerView` and `HeroStationPlayer` each carry their own copy of the ladder (both import `createNetworkRecovery` directly), so a fix to one does not reach the others. |
| `useNotifications()` | | Badge: `GET /notifications/unread-count` every 60s while visible; stops when hidden and, on return, refetches only if the last attempt is 60s old. Feed: `GET /notifications` re-fetched from the head on every panel open (`loadFeed`), cursor paging via `loadMore` (full next-link query is replayed), sequence counters (`feedSeq`, `mutationSeq`) discard overtaken responses. Mutations (`markRead` -> `POST /notifications/{id}/read`, `markAllRead` -> `POST /notifications/read-all`, `remove` -> `DELETE /notifications/{id}`) are optimistic with rollback and a badge resync. Not connected to Echo. |
| `useSignOut()` -> `{signOut(redirectTo = "/", {confirmed?}), signingOut, isBroadcasting}` | | Module-level pending flag shared across all buttons. If broadcasting (`live`/`reconnecting`/`connecting`) and not `confirmed`, uses `window.confirm`. Then `POST /logout` (errors ignored), `clearAuth()`, toast "Signed out", `router.push`, `router.refresh`. |
| `useDocumentTitle(title \| null)` | | Sets `document.title` while mounted, restores the previous title on unmount or null. |
| `useMounted()` | | `useSyncExternalStore` returning false on server and first hydration render, true after. |
| `useIsMobile()` | | `matchMedia(max-width: 767px)`; returns false on the server and first render. |

## Interfaces (client/interfaces)

Hand-written mirrors of API payloads; nothing generates or validates them, so drift is silent.

| File | Contents |
|---|---|
| `User.ts` | `User`: `id`, `name`, `email`, `avatar_url`, optional `google_id`, `has_password`, `stripe_customer_id`, `email_verified_at`, and optional `plan` (present on `GET /user`, stripped from the cookie). |
| `Plan.ts` | `Plan {slug, name, autodj_enabled, analytics_days, max_listeners, embed_enabled, encoder_enabled, watermarked, expires_at}`; constants `PRO_PRICE_USD = 15` and `PRO_AVAILABLE = false` (Pro is by request only). |
| `Station.ts` | `Station` (public and owner shapes in one type: `schedules?`, `autodj_slots?`, `programme?`, `encoder?`, `stats?`, `indexable?` are optional depending on endpoint), `StationSchedule`, `SocialLink`, `StationEncoder`, `AutodjSlot`, `Programme`. Coarse `state` is `offline | on_air | live` (no `starting`). |
| `StationStatus.ts` | `StationStatus`: `state` `offline/starting/on_air/live/degraded`, `desired_state`, `reachable`, `ready`, `icecast_connected`, `source`, `broadcaster`, `live_source`, `now_playing`, `elapsed`, `remaining`, `playlist_length`, `up_next`. |
| `StreamSession.ts`, `Playlist.ts`, `Track.ts` | session rows (`source_type` browser/electron/external; only live sessions exist), playlists (`sequential`/`shuffle`), tracks (`kind` music/jingle) and `LibraryMeta`. |
| `Audience.ts` | `Audience` is `AudienceLocked` or `AudienceReport` (discriminated on `locked`); report has `totals`, `daily`, and `countries`/`devices`/`browsers`/`referrers` dimensions; `AUDIENCE_WINDOWS = [7, 30, 90]`. See [listener analytics](listener-analytics.md). |
| `Notification.ts` | `Notification` (level info/success/warning/error, category, `action {mode, label, url, detail{heading, points}}`, `read_at`), `NotificationPage` (`links.next`, `meta.unread_count`), `UnreadCount {unread_count, capped_at}`. See [notifications and email](notifications-and-email.md). |

## Shared lib helpers (in scope)

- `lib/utils.ts` `cn()` = `twMerge(clsx(...))`.
- `lib/format.ts`: `formatDate(iso, "relative" | "short" | "full")` (relative switches to "Apr 15" after 7 days; short is en-US month + day, full uses the viewer's locale), `formatDuration(seconds)` ("1h 23m", "1h", "45m 10s", "45s", "0m" for <=0; the "<1m" branch is unreachable), `formatDateRange`, `formatAirtime` (minutes floor, "<1m" under 60s), `formatBytes` (KB and MB as rounded integers, GB with one decimal), `formatTrackTime` ("3:07"), `formatClock` ("HH:MM:SS", floors fractions), `formatDateTime` ("Aug 29, 6:04 PM"), `countryName` (Intl.DisplayNames, falls back to the code), `countryFlag` (regional indicator emoji, empty for non-two-letter input).
- `lib/programme.ts`: `formatSlotInstant(iso, tz)` ("HH:MM" if within 24h, else "Mon 06:00", in the **station's** zone) and `describeProgramme(programme, tz, defaultName)` -> `{now, detail}` ("until 12:00 · then Main rotation"). See [schedule](schedule.md).
- `lib/notifications.ts`: `notificationHref` (resolves against `window.location.origin`; same-origin becomes a client route; non-http(s) schemes such as `javascript:` are refused), `resolveNotificationAction` (`none` when there is no action or its URL is refused; `expand` only if `mode === "expand"` and `detail.points` is non-empty; otherwise `link`), `formatUnreadCount(count, cappedAt)` ("99+"), level classes (no state colours: warning is neutral, success violet, error `fault-text`).
- `lib/echo.ts`: `getEcho()` singleton, described under Realtime; `echoConnected(echo)`.
- `lib/embed.ts`: `EMBED_HEIGHT = 88`, `embedUrl(slug)`, `embedSnippet(slug, name)` (iframe with `allow="autoplay"`, `loading="lazy"`).
- `lib/seo.ts`: `DEFAULT_OG_IMAGE`, `metaDescription(text, 160)`, `pageMetadata({title, description, path})`.
- `lib/hlsRecovery.ts`: `createNetworkRecovery(hls, HlsCtor, giveUp)`.
- Not documented here (feature libraries): `audioEngine.ts`, `broadcast.ts`, `queueStore.ts`, `micPrefs.ts`, `milestones.ts`, `listenerLibrary.ts`, `useAudioLevels.ts`, `useEngine.ts`, `useCoarsePointer.ts`, `google-auth.ts`, `hlsPlaylistLoader.ts`, `share.ts`, `socialLinks.ts`.

### Echo details

`getEcho()` builds `new Echo({broadcaster: "pusher", key, cluster: "mt1", wsHost, wsPort/wssPort, forceTLS: true, enabledTransports: ["ws","wss"]})` once per tab. Private-channel signing is a custom `channelAuthorization.customHandler` that `POST`s `{socket_id, channel_name}` to `NEXT_PUBLIC_BROADCAST_AUTH_URL` with `credentials: "include"` (pusher-js's built-in transport cannot send cookies). The API must list `broadcasting/auth` in `config/cors.php` `paths` (it does) with `supports_credentials` true (it is). A non-OK answer is handed back to pusher-js as an error so one rejected channel does not kill the shared socket. Returns null (no socket) during SSR or when key or auth URL is unset.

## Server versus client split

- Root, marketing, auth and dashboard layouts, `not-found`, `robots`, `manifest`, `getStation`, and all `page.tsx` that call `apiFetch` are server components (dynamic where they read cookies). The dashboard layout does the identity fetches on the server and hands plain props to client providers.
- Anything with state, effects, browser APIs, axios or Echo carries `"use client"`. Across `app`, `components`, `contexts`, `hooks` and `lib` about 124 files declare it (of 192 `.tsx` files under `app` and `components`).
- Server pages under `/dashboard` (overview, library, audience, schedule, settings, broadcasts) call `apiFetch` themselves; live pieces (status, listeners, notifications, studio) are client components polling with axios or the public feed.
- Two auth cookies, different owners: `token` (HttpOnly, set and cleared by the API) and `user` (JSON identity cache written by the client, 7 days, `plan` stripped). They drift; `getSession()` and the dashboard layout both require both.

## Surfaces

- Every web page inherits the root layout, fonts, tokens, Toaster and (in production) the four analytics/SEO scripts.
- `/dashboard/**` additionally gets the provider tree, the sidebar shell and the dashboard error boundary.
- Marketing (`app/(marketing)/layout.tsx`) is `max-w-[1200px]` on `bg-dark` with `Navbar` and `Footer`; auth layout is a centred logo on `#08080d`. See [marketing-site-help-blog](marketing-site-help-blog.md) and [auth](auth.md).
- `/hls-proxy/[...path]` (dev only) reads `LIQUIDSOAP_HLS_DIR` from disk: 404 unless `NODE_ENV === "development"`, path-traversal guard (`startsWith(HLS_DIR + sep)`), only `.m3u8/.aac/.ts/.m4s/.mp4`, `Cache-Control` no-cache for manifests and immutable for segments, `Access-Control-Allow-Origin: *`. Point the API at it with `LIQUIDSOAP_HLS_BASE_URL=http://localhost:3000/hls-proxy`.
- Mobile app does not share this code; it has its own stack, see [mobile-app-shell-and-auth](mobile-app-shell-and-auth.md).

## Gaps and traps

1. **Light theme is dead code.** `:root` holds a full light palette and `next-themes` is a dependency, but `<html class="dark">` is hardcoded, `viewport.colorScheme` is `"dark"`, there is no `ThemeProvider` and no toggle. Editing the `:root` tokens changes nothing visible.
2. **Sonner theme follows the OS, not the page.** `useTheme()` with no provider yields `"system"`, so a light-mode OS gets light-theme toast internals on a dark page. The popover-token overrides hide most of it.
3. **The `sidebar_state` cookie is written but never read.** `SidebarProvider` writes it on every toggle, but `dashboard/layout.tsx` never reads it and passes no `defaultOpen`, so the collapsed state does not survive a reload. The privacy page still lists the cookie as a preference.
4. **`lib/axios.ts` `getCookie("token")` is effectively dead** for current sessions (the cookie is HttpOnly). Auth works only through `withCredentials` and the API's cookie-to-bearer middleware, so a deployment where the API and web are on unrelated origins or cookie domains would 401 everything. `clearAuth()` cannot clear the HttpOnly token either; only `POST /logout` can.
5. **`proxy.ts` is not a security boundary.** It trusts a client-writable `user` cookie and only checks that `token` exists. The dashboard layout repeats the same cookie checks and the API is the actual authority.
6. **`dashboard/layout.tsx` `JSON.parse` is unguarded** on the `user` cookie (unlike `getSession()`, which is guarded); a malformed cookie throws in the layout, reaching `app/error.tsx` rather than redirecting. `proxy.ts` catches the parse error, but the layout has its own copy.
7. **`app/error.tsx` shows `error.message` to visitors** and never reports to Sentry (only `global-error.tsx` does; Sentry's `onRequestError` covers server-side errors). `app/dashboard/error.tsx` correctly hides it behind "Details".
8. **Analytics is unconditional.** Umami, GA, Clarity and JSON-LD load in production on every route including `/dashboard` and `/auth`; there is no consent banner and no route exclusion.
9. **Fonts are loaded twice under two names.** `body` and `display` both instantiate Bricolage Grotesque with identical options and different CSS variables. Harmless but confusing; changing one and expecting the other to follow is a trap.
10. **No CSP.** Only frame, nosniff and referrer headers exist. `/embed` intentionally has no frame restriction.
11. **`useNotifications` comment is stale.** Its doc says there is no push transport and `BROADCAST_CONNECTION=log`; the app now has Echo, but notifications still poll every 60s and are not wired to it.
12. **Three copies of the playback ladder.** `useStreamPlayback` is used only by `EmbedPlayer`; `PlayerView` and `HeroStationPlayer` have their own HLS/Icecast logic (each calls `useListenerSession` and `createNetworkRecovery` itself). Fixes to HLS handling must be made in all three.
13. **`ProRequestContext` default is a silent no-op**, and `usePlan()` null makes every locked-state hook return unlocked, so if the `/user` fetch fails in the layout, upsell buttons vanish and nothing tells the user why. This is deliberate (never lock out a payer) but easy to mistake for a bug.
14. **`Tooltip` needs a provider that only `PlayerView` mounts.** No layout wraps `TooltipProvider`; `SidebarMenuButton` renders a `Tooltip` only when passed a `tooltip` prop, and `AppSidebar` passes none. Adding a tooltip anywhere else without its own provider will throw at render.
15. **`actions/auth.ts` is in a folder named for server actions but is client code.** `saveAuth` accepts a token argument and discards it.
16. **`Station` and `StationStatus` are one hand-maintained type for several payload shapes.** Optional fields (`schedules`, `encoder`, `programme`, `stats`, `indexable`) exist only on some endpoints; `state` on `Station` cannot be `starting`. Nothing checks these against the API. `Plan.watermarked` and `Station.watermarked` are documented as dead and must not be rendered.
17. **`PRO_AVAILABLE = false` and `PRO_PRICE_USD = 15` are client constants**, not read from the API (the `plans` table has no price).
18. **`next.config.ts` image host is computed at config load** from `NEXT_PUBLIC_API_URL`; a build without it silently allows `api.gocast.fm` only. Only `https` is allowed for the API host, so an http API in a non-development environment cannot serve optimized artwork.
19. **Proxy matcher exclusions are prefix matches** (`api`, `embed`), so any future top-level route starting with those letters is silently unprotected by `proxy.ts`.
20. **Sentry `webpack:` options are mostly inert.** `automaticVercelMonitors` only acts when `process.env.VERCEL` is set (`getFinalConfigObjectUtils.js` `maybeGetVercelCronsConfig`), and this deploy is a VPS. `treeshake.removeDebugLogging` is applied only in Sentry's webpack config path (`config/webpack.js`); `npm run build` passes no `--webpack` flag, so whether `next build` uses Turbopack or webpack here needs a real build to confirm.
21. **`useStationStatus` does not stop on hidden tabs, it just skips the read**; the timer keeps firing at the current pace. Cheap, but the code comment "polling stops" overstates it.
22. **`client/.env.example` omits `INTERNAL_API_URL` and `INTERNAL_ICECAST_URL`**, both of which the code reads.

## Tests

- No unit or component tests exist in `client/`. Only Playwright e2e under `client/tests/e2e` (`auth.spec.ts`: protected-route redirect, bad credentials, verified sign-in and redirect away from auth pages and sign-out, unverified block, register + verify, password reset, email change, password change, account deletion, Google auth popup; `help-screenshots.spec.ts`; `support/auth.ts`). `playwright.config.ts` starts the API (`php8.4 artisan serve --host=127.0.0.1 --port=8000 --no-reload` in `../api`) and `npm run dev`, CI: one worker, 2 retries; Chromium only, 30s timeout.
- `npm run lint` is the only static check besides `tsc` via `next build`.

## History

- Translate-safe DOM patch, Sentry ignore list, root-layout font swap and the dashboard error boundary are described in memory notes and commits (`045b494`, `ea570df`); the console redesign that introduced the state tokens is in `docs/` design notes. Treat those as history, this file as the spec.
