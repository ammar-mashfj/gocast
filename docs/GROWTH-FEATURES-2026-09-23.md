# Growth features — shortlist

**Date:** 2026-09-23
**Status:** ideas only, nothing built. Pick one to scope before starting.

The question: what can we build now that attracts more users?

The idea behind the ranking: every broadcaster brings an audience, and the public
player page is the only GoCast surface that reaches people who haven't signed up.
Features that turn listeners into new broadcasters grow along with the stations we
already have. Ranked by growth per day of effort.

---

## Top picks

### 1. Replays of live shows (~2–3 days)

Today a live show is gone the moment it ends: Free is live-only, and nothing is recorded.
Saving each live broadcast as an episode on the station page:

- lets listeners who missed the show catch up, the most common complaint about
  live-only platforms;
- leaves something to share after every show, so the page has content even when
  the broadcaster is off air;
- gives a natural Free/Pro split: Free keeps the last 3 shows for 7 days, Pro keeps
  them all and can download them.

Build notes: Liquidsoap can already write the live arm to a file, so the work is
storage, a list UI and a player. **Risk:** disk space is already the tightest limit on
the VPS (~130 GB usable), so retention limits are needed from day one.

### 2. Measure the player-page funnel, then reward it (~0.5 day + optional reward)

**Already built; don't redo:**
- Every station page ends with "Powered by GoCast" and a **"Launch your own station →"**
  button (`client/app/station/[slug]/PlayerView.tsx:1182-1193`). The embed has an
  "on GoCast" link back to the station page (`EmbedPlayer.tsx:141`).
- Per-station share image: artwork + name + genre (`app/station/[slug]/opengraph-image.tsx`).
  Don't add LIVE / current track to it. Facebook, X and WhatsApp cache the image, so a
  stale "LIVE" would stay on shares for days.
- Genre pages: skip. `/discover` is deliberately hidden (redirects to `/`) until there are
  enough stations, and genre pages would have the same problem: near-empty pages don't
  rank and look bad.

**What's missing: we can't tell if any of it works.** The button links to plain
`/auth/register`, so there's no way to know whether a sign-up came from a station page,
or which station sent it.

1. **Attribution (~0.5 day).** Button → `/auth/register?ref=<station-slug>` (Google OAuth
   has to carry it through too); the new user is saved with the station that referred them.
   Admin panel shows "sign-ups from station pages" per station.
2. **Referral reward (optional, after 1).** Once we can see who brought whom, give the
   broadcaster something for it, e.g. a free month of Pro after 3 sign-ups from their page.
   That gives broadcasters a reason to share their page more, which grows the funnel more
   than any button change would. Builds on the existing plan-granting invite links; with no
   billing yet, the free month has to be a plan that expires automatically, which
   `plans:expire` already handles.

### 3. Automatic listing on Radio Browser (<1 day)

radio-browser.info has an open API and feeds VLC, many car stereos, Home Assistant and
hundreds of radio apps. Submitting Pro stations automatically, using the public stream
URL Pro already has, gives them listeners they didn't have to find themselves. Also a
strong pricing-page line: "get listed in 1000+ radio apps".

---

## Also strong

### 4. Listener reactions (~1–1.5 days)

Most of what chat offers (a station that feels alive) with none of the moderation. A
fixed set (🔥 ❤️ 👏 😂 🎶) means there's nothing to moderate: no text, no bans, no nicknames.

- Listener taps a reaction on the player page. No account; tied to the listener token
  already issued by `POST /stations/{slug}/listen`.
- **Owner sees reactions live** in the dashboard/studio, e.g. "🔥 x12" the moment a
  track lands. That's the real value: live feedback broadcasters don't have today.
- **Per-station on/off switch** in settings. When off, the buttons are hidden and the
  API rejects reactions.
- Only abuse case is repeated tapping: per-token cap (~1/sec, ~20/min).
- **Owner-only first.** The dashboard already has a live connection
  (`StationStateChanged` over Pusher, `client/lib/echo.ts`). Showing reactions to all
  listeners (floating emojis) sends every reaction to every listener and eats the Pusher
  message quota. If done later, batch it: one "🔥 x7" every ~2s per station.
- **Bonus:** store each reaction against the current track (the API already gets
  `/internal/now-playing`) → a **"most loved tracks"** list on the Audience page. The first
  data about which songs listeners actually like; most useful to AutoDJ owners.

### 5. Live chat on the player page — small v1 (~2 days)

Ranked below reactions: bigger and riskier for similar value. Doesn't need listener
registration, which would leave the chat empty.

**v1 scope:**
- Guest nickname (the browser remembers it) + a server-signed guest ID, same idea as the
  listener token. No email, no password.
- Owner messages get an "owner" badge; signed-in GoCast users show their real name.
- Rate limit (1 message per 3s), length limit, no links from guests.
- Owner can delete a message and ban a guest ID.
- Per-station switch to turn chat off.

**Later, only once someone actually abuses it** (a 15-listener station isn't a target):
- **Shadow-mute** instead of a visible ban: the banned guest still sees their own messages,
  nobody else does, so there's no reason to come back under a new ID.
- **Never ban an IP.** Mobile carriers (CGNAT), schools and offices put thousands of people
  behind one IP. Use the IP only as a hint: a *new* guest ID on an IP where a guest was banned
  in the last ~24h must pass Turnstile or wait for approval before its messages show. For
  IPv6, use the /64 prefix.
- Cloudflare Turnstile on first message (needs the site behind Cloudflare).
- Per-station mode: off / guests allowed / **signed-in only** (the fallback for a
  coordinated attack).

Until then, if a banned user gets around the ban, the owner turns chat off for the evening.

### 6. Calendar button for scheduled shows (~0.5 day)

"Notify me when live" already exists (`StationNotifyController`) and show times already
exist. An "Add to calendar" link (.ics) plus a follow button would bring listeners back
each week.

---

## Fix before promoting anything

- **There's no way to pay.** Pro only comes through the waitlist or an admin grant
  (`ProAccessDialog`, `WaitlistController`), so new users we attract have no way to
  pay for Pro.
- **Missing Pro features on the pricing page:** it advertises a **custom domain**
  (nothing named `custom_domain` exists anywhere) and **higher-bitrate audio** (fixed
  at 128k). Build them or remove them before a traffic push.

---

## Recommended order

1. #2 attribution and #3 first. Both are under a day; attribution comes first because
   without it we can't tell whether anything else on this list brings in users.
2. Then #1 (replays), the feature most likely to get people to sign up and upgrade.
3. #4 reactions next, since they're cheap and make stations feel alive; chat (#5) only after them.
4. Self-serve billing alongside, before any real traffic push.
