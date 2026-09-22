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

### 2. Turn the player page into a sign-up funnel (~1–2 days)

Right now every listener is a dead end. Cheap changes:

- A "Start your own station, free" link on every `/station/[slug]` page and inside
  the Pro embed.
- Per-station share images: artwork + LIVE state + current track.
  `client/app/opengraph-image.tsx` exists at the app root only, not per station.
- Genre landing pages under `/discover` (e.g. "Lo-fi radio stations") for search traffic.

### 3. Automatic listing on Radio Browser (<1 day)

radio-browser.info has an open API and feeds VLC, many car stereos, Home Assistant and
hundreds of radio apps. Submitting Pro stations automatically, using the public stream
URL Pro already has, gives them listeners they didn't have to find themselves. Also a
strong pricing-page line: "get listed in 1000+ radio apps".

---

## Also strong

### 4. Live chat on the player page (~2–3 days)

laravel-echo and pusher-js are already in the client, so real-time messaging is partly
in place. Chat makes listeners come back and makes a small station feel alive. Needs
moderation from day one: the owner can delete messages and ban users, plus rate limits.

### 5. Calendar button for scheduled shows (~0.5 day)

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

1. #2 and #3 first, since they're cheap and every existing station starts bringing
   in users.
2. Then #1 (replays), the feature most likely to get people to sign up and upgrade.
3. Self-serve billing alongside, before any real traffic push.
