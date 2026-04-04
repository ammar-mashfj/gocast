# Phase 0 — Laravel API Tasks

## Task 1: Project Scaffolding (Laravel portion)
- [x] 1.1 Initialize Laravel project in `/api` with `composer create-project laravel/laravel api`
- [x] 1.2 Install Laravel Sanctum: `php artisan install:api`
- [x] 1.3 Configure `.env` for MySQL and Redis connections

## Task 2: Database Schema & Migrations
- [x] 2.1 Create `users` migration (extend Laravel default):
  - Add: `stripe_customer_id` nullable string
  - Add: `avatar_url` nullable string
- [x] 2.2 Create `stations` migration:
  - `id` UUID primary key
  - `user_id` foreign key -> users
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
  - `station_id` foreign key -> stations
  - `started_at` timestamp
  - `ended_at` timestamp nullable
  - `peak_listeners` integer (default: 0)
  - `total_listener_minutes` integer (default: 0)
  - `source_type` enum (browser/electron/external, default: browser)
- [x] 2.4 Create models: User (update), Station, StreamSession with relationships and UUID traits
- [x] 2.5 Run migrations, verify schema

## Task 3: Authentication API
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

## Task 4: Station Management API
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

## Task 5: Stream Session API
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

## Task 11: Player Page (Laravel Blade)
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
  - "Powered by GoCast.fm — Start your own station ->" footer (links to homepage)
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
