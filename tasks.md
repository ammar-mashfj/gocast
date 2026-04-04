# GoCast — MVP Build Tasks

## Project Overview
GoCast is a freemium internet radio streaming platform. Users broadcast live audio from their browser, get a shareable player page, and listeners tune in instantly. No downloads, no server setup.

## Tech Stack
- **API**: Laravel 13 + Sanctum (token auth) + MySQL 8 + Redis
- **Frontend**: React 19 + TypeScript + Vite + React Router v7 + Tailwind CSS + Zustand
- **Relay**: Node.js + ws (WebSocket library)
- **Streaming**: Icecast2 (installed on host, not Docker)
- **Web Server**: Nginx (reverse proxy)

## Repo Structure
```
gocast/
├── api/                # Laravel 13 API
├── client/             # React SPA (Vite + TypeScript)
├── relay/              # Node.js WebSocket-to-Icecast relay
├── player/             # Player page (Laravel Blade, served separately for SEO)
├── nginx/              # Nginx config files
├── docker-compose.yml  # MySQL + Redis + Nginx (Icecast on host)
├── tasks.md            # This file
├── README.md
└── ARCHITECTURE.md
```

## Design Reference
- Dark theme, purple (#8B5CF6) accent color
- Design mockups were created during planning (player page, homepage, dashboard, broadcaster)
- Tailwind CSS for all styling
- Clean, modern, editorial feel — not generic SaaS

## Audio Pipeline (proven in POC)
```
Browser (getUserMedia / File) → lamejs MP3 encode → WebSocket → Node relay → Icecast → Listeners (<audio> tag)
```

---

## PHASE 0: MVP

### Task 1: Project Scaffolding
- [x] 1.1 Initialize Laravel project in `/api` with `composer create-project laravel/laravel api`
- [x] 1.2 Install Laravel Sanctum: `php artisan install:api`
- [x] 1.3 Configure `.env` for MySQL and Redis connections
- [x] 1.4 Initialize React project in `/client` with `npm create vite@latest client -- --template react-ts`
- [ ] 1.5 Install client dependencies: `react-router-dom`, `axios`, `tailwindcss`, `@tailwindcss/vite`, `zustand`, `react-hook-form`, `lamejs`
- [ ] 1.6 Configure Tailwind CSS in the client
- [x] 1.7 Initialize Node relay in `/relay` with `package.json` and `ws` dependency
- [x] 1.8 Create `docker-compose.yml` at repo root with MySQL 8 and Redis services
- [ ] 1.9 Create basic `.gitignore` for all three projects
- [ ] 1.10 Verify all three projects start without errors

### Task 2: Database Schema & Migrations
- [x] 2.1 Create `users` migration (extend Laravel default):
  - Add: `stripe_customer_id` nullable string
  - Add: `avatar_url` nullable string
- [x] 2.2 Create `stations` migration:
  - `id` UUID primary key
  - `user_id` foreign key → users
  - `name` string (max 100)
  - `slug` string unique (URL-safe, max 60)
  - `description` text nullable
  - `genre` string nullable
  - `artwork_url` string nullable
  - `plan` enum (free/starter/pro/studio, default: free)
  - `is_live` boolean (default: false)
  - `icecast_mount` string (auto-generated: /stream/{slug})
  - `icecast_password` string (auto-generated random)
  - `social_links` JSON nullable
  - `theme_config` JSON nullable
  - `stripe_customer_id` nullable string
  - `stripe_subscription_id` nullable string
  - `created_at`, `updated_at` timestamps
- [x] 2.3 Create `stream_sessions` migration:
  - `id` UUID primary key
  - `station_id` foreign key → stations
  - `started_at` timestamp
  - `ended_at` timestamp nullable
  - `peak_listeners` integer (default: 0)
  - `total_listener_minutes` integer (default: 0)
  - `source_type` enum (browser/electron/external, default: browser)
- [x] 2.4 Create models: User (update), Station, StreamSession with relationships and UUID traits
- [x] 2.5 Run migrations, verify schema

### Task 3: Authentication API
- [x] 3.1 Create `RegisterRequest` form request (name, email, password validation)
- [x] 3.2 Create `LoginRequest` form request
- [x] 3.3 Create `AuthController` with:
  - `POST /api/register` — create user, send verification email, return token
  - `POST /api/login` — validate credentials, return Sanctum token
  - `POST /api/logout` — revoke current token
  - `GET /api/user` — return authenticated user with plan details
- [x] 3.4 Set up email verification routes
- [x] 3.5 Configure CORS for the React client origin
- [x] 3.6 Test all auth endpoints with curl or Postman

### Task 4: Station Management API
- [x] 4.1 Create `StationRequest` form request (name, slug validation, slug uniqueness)
- [x] 4.2 Create `StationResource` API resource
- [x] 4.3 Create `StationPolicy` (user can only manage own stations, enforce plan limits)
- [x] 4.4 Create `StationController` with:
  - `GET /api/stations` — list user's stations
  - `POST /api/stations` — create station (auto-generate mount and password, enforce plan station limit)
  - `GET /api/stations/{station}` — show station details
  - `PUT /api/stations/{station}` — update station settings
  - `DELETE /api/stations/{station}` — delete station
- [x] 4.5 Create `StationService` with business logic:
  - `createStation()` — generate unique slug, icecast mount path, random source password
  - `checkPlanLimits()` — verify user hasn't exceeded station count for their plan
- [x] 4.6 Add route for generating stream auth token:
  - `POST /api/stations/{station}/stream-token` — returns a short-lived token the relay uses to authenticate the broadcaster
- [x] 4.7 Add route for station public info (no auth required):
  - `GET /api/public/stations/{slug}` — returns station name, description, genre, artwork, is_live, listener_count
- [x] 4.8 Test all station endpoints

### Task 5: Stream Session API
- [x] 5.1 Create `StreamSessionController`:
  - `POST /api/stations/{station}/sessions/start` — create new session, set station is_live=true
  - `POST /api/stations/{station}/sessions/end` — close session, set station is_live=false, calculate duration
  - `GET /api/stations/{station}/sessions` — list past sessions
- [x] 5.2 Create endpoint for relay to validate stream tokens:
  - `POST /api/internal/validate-stream` — relay sends station_id + token, API confirms validity
- [x] 5.3 Create endpoint for relay to update listener count:
  - `POST /api/internal/listeners` — relay sends station_id + count, API updates Redis cache
- [x] 5.4 Create endpoint to get current listener count:
  - `GET /api/public/stations/{slug}/listeners` — returns count from Redis

### Task 6: React App Foundation
- [ ] 6.1 Set up React Router with route structure:
  - `/` — Landing page
  - `/login` — Login page
  - `/register` — Register page
  - `/dashboard` — Station list (protected)
  - `/dashboard/stations/:id` — Station detail/management (protected)
  - `/dashboard/stations/:id/broadcast` — Broadcaster page (protected)
  - `/dashboard/settings` — Account settings (protected)
- [ ] 6.2 Create API client with Axios:
  - Base URL configuration
  - Token interceptor (attach Sanctum token to requests)
  - Error interceptor (401 → redirect to login)
- [ ] 6.3 Create auth store with Zustand:
  - `user`, `token`, `isAuthenticated`
  - `login()`, `register()`, `logout()`, `fetchUser()`
  - Persist token in localStorage
- [ ] 6.4 Create `ProtectedRoute` component (redirects to login if not authenticated)
- [ ] 6.5 Create basic layout components:
  - `AppLayout` — sidebar + main content area (for dashboard)
  - `PublicLayout` — for landing/auth pages
- [ ] 6.6 Set up Tailwind with custom theme:
  - Primary purple: #8B5CF6
  - Dark background: #0A0A0F
  - Surface colors, text opacity levels matching the mockups

### Task 7: Auth Pages (React)
- [ ] 7.1 Create `RegisterPage`:
  - Name, email, password, confirm password fields
  - Form validation with react-hook-form
  - Submit → call API → store token → redirect to dashboard
  - Link to login page
- [ ] 7.2 Create `LoginPage`:
  - Email, password fields
  - Submit → call API → store token → redirect to dashboard
  - Link to register page
- [ ] 7.3 Create `EmailVerificationPage`:
  - Show "check your email" message after registration
  - Resend verification button
- [ ] 7.4 Style auth pages matching the dark theme design

### Task 8: Dashboard (React)
- [ ] 8.1 Create `DashboardPage` — list of user's stations:
  - Station cards showing: name, slug, artwork, is_live status, listener count
  - "Create Station" button
  - Each card links to station management
- [ ] 8.2 Create `CreateStationModal` or page:
  - Name input
  - Auto-generated slug (editable, with availability check)
  - Genre selector
  - Artwork upload (optional, provide default)
  - Description textarea
- [ ] 8.3 Create `StationDetailPage`:
  - Station overview (name, URL, status)
  - "Go Live" button → navigates to broadcaster page
  - "Open Player Page" link (external)
  - Station settings form (edit name, description, genre, artwork)
  - Copy station URL button
  - Stream session history list
- [ ] 8.4 Create sidebar navigation:
  - Icon-based slim sidebar matching the mockup
  - Dashboard, Broadcast, Analytics (placeholder), Settings
  - Active state highlighting
  - User avatar at bottom

### Task 9: Node.js Relay (Production Version)
- [x] 9.1 Rewrite relay from POC to production:
  - Load configuration from environment variables (ICECAST_HOST, ICECAST_PORT, ICECAST_SOURCE_PASSWORD, API_URL, WS_PORT)
  - Structured logging
- [x] 9.2 Add authentication:
  - On WebSocket connection, client sends: `{ type: "auth", stationId: "xxx", token: "xxx" }`
  - Relay validates token against Laravel API (`POST /api/internal/validate-stream`)
  - Reject connection if invalid
  - On successful auth, open Icecast source connection for that station's mount point
- [ ] 9.3 Add hold music / reconnection grace period (deferred — frontend concern)
- [x] 9.4 Add listener count polling:
  - Every 10 seconds, poll Icecast status-json.xsl
  - Parse listener counts per mount point
  - Send updated counts to Laravel API (`POST /api/internal/listeners`)
- [x] 9.5 Add metadata update support:
  - When broadcaster sends `{ type: "metadata", title: "...", artist: "..." }`
  - Update Icecast metadata for the mount point via admin API
- [x] 9.6 Add health check endpoint:
  - Simple HTTP endpoint on a separate port for monitoring
- [x] 9.7 Handle graceful shutdown (SIGTERM → close all connections cleanly)

### Task 10: Broadcaster Page (React) — THE CORE
- [ ] 10.1 Create `useAudioCapture` hook:
  - `startMicCapture()` — getUserMedia with echo/noise cancellation disabled
  - `startFileCapture(file)` — decode audio file, play via AudioBufferSourceNode
  - `stopCapture()` — disconnect all nodes, close audio context
  - `switchSource(type)` — swap between mic and file without disconnecting the stream
  - Returns: `audioStream`, `analyserNode`, `isCapturing`, `currentSource`
- [ ] 10.2 Create `useEncoder` hook:
  - Initialize lamejs Mp3Encoder
  - `encodeSamples(float32Array)` → Uint8Array of MP3 data
  - Buffer MP3 chunks and flush at regular intervals (250ms)
  - `flush()` — get remaining encoded data
  - Returns: `encode()`, `flush()`, `isEncoding`
- [ ] 10.3 Create `useWebSocket` hook:
  - Connect to relay with station auth credentials
  - Send auth message on connect
  - Send binary audio data
  - Send metadata updates
  - Handle reconnection on disconnect
  - Returns: `connect()`, `disconnect()`, `sendAudio()`, `sendMetadata()`, `isConnected`, `connectionState`
- [ ] 10.4 Create `useBroadcaster` hook (combines the above three):
  - `goLive()` — start capture → start encoder → connect WebSocket → notify API (session start)
  - `stopBroadcast()` — stop capture → flush encoder → disconnect WebSocket → notify API (session end)
  - `switchSource(type)` — swap mic/file source without interrupting stream
  - Manages the full audio pipeline: capture → encode → buffer → send
  - Returns: `goLive()`, `stopBroadcast()`, `isLive`, `duration`, `bytesSent`
- [ ] 10.5 Create `AudioMeter` component:
  - Reads from AnalyserNode
  - Renders stereo L/R level bars
  - Animated, matching the mockup design
- [ ] 10.6 Create `SourceSelector` component:
  - Three options: Microphone, Screen Audio (future), File Queue
  - Shows active audio device name
  - "Change" button for selecting different mic input
- [ ] 10.7 Create `FileQueue` component:
  - Drag and drop zone for audio files
  - List of queued files with: title (from filename or ID3), duration, drag handle, remove button
  - Drag to reorder
  - Currently playing indicator
  - Auto-advance to next track
  - Files stored in browser memory only (not uploaded)
- [ ] 10.8 Create `NowPlaying` component:
  - Current track artwork, title, artist
  - Progress bar (for file playback)
  - EQ visualizer animation
- [ ] 10.9 Create `BroadcastControls` component:
  - Play/pause, next track, previous track
  - Shuffle, repeat toggles
  - Volume slider
  - Mute button
- [ ] 10.10 Create `StreamStatus` component:
  - Live/offline badge
  - Broadcast duration (counting timer)
  - Bytes sent
  - Current listener count (polled from API)
- [ ] 10.11 Create `MetadataEditor` component:
  - Track title, artist, show name input fields
  - Auto-populated from file ID3 tags when available
  - Manual override sends metadata update to relay
- [ ] 10.12 Assemble `BroadcasterPage`:
  - Layout matching the mockup: main content left, info panel right
  - Wire all components together
  - "Go Live" / "Stop Broadcast" primary action
  - `beforeunload` warning when live: "You're still broadcasting to X listeners"

### Task 11: Player Page
- [ ] 11.1 Create as Laravel Blade template (SEO-friendly, fast loading):
  - Route: `GET /{slug}` — loads station public data, renders Blade view
  - Falls back to 404 if station doesn't exist
- [ ] 11.2 Design matching the mockup:
  - Station artwork as blurred background with dark overlay
  - Station name (large typography), genre tag, description
  - Play/pause button (prominent, animated)
  - Volume slider
  - "LIVE" badge (pulsing when broadcasting, hidden when offline)
  - Listener count (real-time)
  - Now Playing: track title and artist
  - Share buttons (Twitter/X, WhatsApp, copy link)
  - "Powered by GoCast.fm — Start your own station →" footer (links to homepage)
- [ ] 11.3 Audio player implementation:
  - HTML5 `<audio>` element connecting to Icecast stream URL
  - JavaScript: play/pause control, volume control
  - Handle stream offline state (show "Station is offline" message)
  - Auto-reconnect when stream comes back online (poll station status)
- [ ] 11.4 Real-time updates:
  - Poll `/api/public/stations/{slug}/listeners` every 10 seconds for listener count
  - Poll station status for is_live changes
  - Update Now Playing metadata when it changes
- [ ] 11.5 Mobile responsive design
- [ ] 11.6 Open Graph meta tags for social sharing:
  - `og:title` = station name
  - `og:description` = station description
  - `og:image` = station artwork
  - `og:type` = music.radio_station
- [ ] 11.7 Minimal JavaScript — page should render and show station info without JS. Audio player enhanced with JS.

### Task 12: Landing Page (React)
- [ ] 12.1 Create `LandingPage` matching the homepage mockup:
  - Navigation bar: GoCast logo, Features, Pricing, Directory, "Start Broadcasting" CTA
  - Hero section:
    - Tagline: "Your voice. On air in 60 seconds."
    - Subtitle explaining the product
    - "Start broadcasting — free" primary CTA
    - "See it in action" secondary CTA
    - Animated orbiting station cards (or simplified version)
  - Social proof stats (stations created, hours broadcast, minutes listened — can be placeholder numbers initially)
  - "How it works" — three steps: Create station, Go live, Share your link
  - Live stations preview — show 4 currently live stations from the directory (or placeholder cards)
  - Pricing section — 4 plan cards matching the mockup
  - Final CTA: "Ready to go on air?"
  - Footer: links, copyright
- [ ] 12.2 Make fully responsive for mobile

### Task 13: Nginx Configuration
- [ ] 13.1 Create nginx config:
  - Serve React SPA (client build) on main domain
  - Proxy `/api/*` to Laravel
  - Proxy `/ws/*` to Node relay (WebSocket upgrade)
  - Proxy `/stream/*` to Icecast (port 8000)
  - Player page routes `/{slug}` to Laravel
  - SSL termination with Let's Encrypt (certbot)
  - CORS headers for Icecast streams
  - Gzip compression
- [ ] 13.2 Create nginx config for local development (simpler, no SSL)

### Task 14: Docker & Deployment
- [ ] 14.1 Create `Dockerfile` for Laravel API:
  - PHP 8.3 + required extensions
  - Composer install
  - Artisan commands (migrate, cache)
- [ ] 14.2 Create `Dockerfile` for React client:
  - Node build step
  - Output to nginx-served static files
- [ ] 14.3 Create `Dockerfile` for Node relay
- [ ] 14.4 Create `docker-compose.yml`:
  - Services: api, client, relay, mysql, redis, nginx
  - Volumes for persistent data (MySQL, uploads)
  - Environment variables
  - Network configuration
- [ ] 14.5 Create `docker-compose.dev.yml` for local development
- [ ] 14.6 Create deployment script or documentation:
  - VPS setup (Ubuntu 24)
  - Install Icecast2 via apt
  - Configure Icecast
  - Clone repo, configure env
  - docker-compose up -d
  - Set up SSL with certbot
  - Configure domain DNS

### Task 15: Polish & Launch Prep
- [ ] 15.1 Error handling throughout:
  - API: consistent error response format
  - Client: error boundaries, toast notifications
  - Relay: connection error recovery
- [ ] 15.2 Loading states:
  - Skeleton screens for dashboard
  - Loading spinners for async actions
  - Broadcaster connection state feedback
- [ ] 15.3 Mobile responsive testing:
  - Player page (critical — most listeners will be mobile)
  - Landing page
  - Dashboard (functional, doesn't need to be perfect)
  - Broadcaster (desktop-only is acceptable for MVP)
- [ ] 15.4 Cross-browser testing:
  - Chrome (primary)
  - Firefox
  - Safari (audio API quirks)
  - Mobile Chrome and Safari
- [ ] 15.5 Create README.md:
  - Project description with screenshots
  - Architecture diagram
  - Tech stack list
  - Self-hosting instructions (docker-compose up)
  - Contributing guidelines
  - License
- [ ] 15.6 Create ARCHITECTURE.md:
  - System overview diagram
  - Audio pipeline explanation
  - Database schema
  - API endpoint list
  - Deployment architecture

---

## PHASE 1: Monetization (after launch, week 3-5)

### Task 16: Stripe Integration
- [ ] 16.1 Install Laravel Cashier
- [ ] 16.2 Create Stripe products and prices for each plan
- [ ] 16.3 Implement checkout flow (Stripe Checkout)
- [ ] 16.4 Implement webhook handler (subscription created, updated, cancelled, payment failed)
- [ ] 16.5 Implement customer portal for managing subscriptions
- [ ] 16.6 Billing page in React dashboard

### Task 17: Plan Enforcement
- [ ] 17.1 Enforce station count limits based on plan
- [ ] 17.2 Enforce listener limits (reject connections in relay beyond plan max)
- [ ] 17.3 Enforce stream quality (bitrate cap per plan)
- [ ] 17.4 Show upgrade prompts when limits are hit

### Task 18: Player Page Customization
- [ ] 18.1 Starter+: custom colors and logo
- [ ] 18.2 Pro+: custom domain support with auto SSL
- [ ] 18.3 Studio: full white-label (remove all GoCast branding)

### Task 19: Audio Ad Injection (Free Tier)
- [ ] 19.1 Pre-roll ad before stream starts for free tier listeners
- [ ] 19.2 Periodic ad injection in relay for free tier stations
- [ ] 19.3 Ad management system (upload audio ads, set rotation)

### Task 20: Embeddable Widget
- [ ] 20.1 Create mini player widget (iframe)
- [ ] 20.2 Generate embed code in dashboard for Starter+ users

---

## PHASE 2: Growth Features (week 6-10)

### Task 21: File Upload & AutoDJ
- [ ] 21.1 File upload endpoint with storage quota enforcement
- [ ] 21.2 ID3 tag extraction
- [ ] 21.3 Playlist management (CRUD, ordering, shuffle/sequential)
- [ ] 21.4 Server-side AutoDJ (Liquidsoap or custom Node process → Icecast)
- [ ] 21.5 Seamless handover: live takeover pauses AutoDJ, stopping live resumes it

### Task 22: Analytics
- [ ] 22.1 Listener analytics aggregation (daily: unique listeners, total minutes, peak concurrent)
- [ ] 22.2 Geographic breakdown from Icecast stats
- [ ] 22.3 Analytics dashboard page in React
- [ ] 22.4 CSV export for Studio users

### Task 23: Station Directory
- [ ] 23.1 Public directory page showing live stations
- [ ] 23.2 Genre filtering and search
- [ ] 23.3 Random station button
- [ ] 23.4 Featured/trending stations

### Task 24: Engagement Features
- [ ] 24.1 Live chat on player page (WebSocket-based)
- [ ] 24.2 Listener reactions
- [ ] 24.3 Song request system
- [ ] 24.4 "Notify me when live" email signup

---

## PHASE 3: Platform Expansion (month 3-6)

### Task 25: Electron Desktop App
- [ ] 25.1 System audio capture
- [ ] 25.2 External audio interface support
- [ ] 25.3 Tray icon with quick go-live
- [ ] 25.4 Auto-update mechanism

### Task 26: DJ Features
- [ ] 26.1 Ducking (auto-lower music when mic active)
- [ ] 26.2 Crossfade between tracks
- [ ] 26.3 Soundboard with keyboard shortcuts
- [ ] 26.4 Audio compressor node
- [ ] 26.5 Voice effects (radio voice, reverb)

### Task 27: Advanced Features
- [ ] 27.1 REST API for Pro+ users
- [ ] 27.2 Webhook notifications
- [ ] 27.3 Schedule management with calendar UI
- [ ] 27.4 Multi-DJ handoff
- [ ] 27.5 Stream recording (save broadcast as MP3)

---

## Notes for Claude Code

### API Conventions
- All API responses follow: `{ data: ..., message: "..." }` or `{ error: "...", message: "..." }`
- Use API Resources for all responses
- Use Form Requests for all validation
- Use Policies for authorization
- UUID primary keys on all models except users (which uses auto-increment)
- All endpoints prefixed with `/api` except player page routes

### Frontend Conventions
- TypeScript strict mode
- Components in PascalCase, hooks prefixed with `use`
- Custom hooks in `/src/hooks/`
- API calls only through `/src/api/` client layer
- Zustand stores in `/src/stores/`
- All pages in `/src/pages/`
- Reusable components in `/src/components/`
- Types/interfaces in `/src/types/`

### Relay Conventions
- Plain Node.js, no framework
- Configuration via environment variables
- Structured console logging with timestamps
- Graceful error handling — never crash the process

### Design System
- Background: #0A0A0F
- Surface: rgba(255,255,255,0.02-0.05)
- Border: rgba(255,255,255,0.06)
- Primary accent: #8B5CF6 (purple)
- Success/live: #34D399 (green)
- Danger: #EF4444 (red)
- Text primary: #E8E8E8
- Text secondary: rgba(255,255,255,0.4)
- Text muted: rgba(255,255,255,0.2)
- Border radius: 8px (small), 12px (medium), 14px (large)
- Font: system font stack (-apple-system, BlinkMacSystemFont, sans-serif)
