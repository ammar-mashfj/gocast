# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally (confirmed 2026-09-25):

- **Individual broadcasters**: hobby DJs, show hosts, music nerds, podcasters who want to go live. They want a show or a personal station on the air without running servers, installing software, or paying for bandwidth.
- **Small community stations**: school, campus, church, neighbourhood and diaspora radio run by a few people, where the job is keeping a schedule on air.

Listeners are a third group. They arrive through a station's shared player-page link and need no app and no account.

## Product Purpose

GoCast hosts internet radio stations. A broadcaster creates a station and goes live from a browser studio. When nobody is live, AutoDJ plays their uploaded library, on Pro. Listeners tune in through a public player page. Success means a first-time broadcaster is on air and sharing a link within minutes, and a station stays worth tuning into between live shows.

## Positioning

Open a browser tab and you are on air. There's nothing to install and no server or bandwidth bill, and listeners need only one link. The free tier is the live product. Pro is the next step: it turns a live show into a station that runs itself, with AutoDJ, playlists, a weekly schedule and desktop encoders.

Homepage priority (confirmed): **Free leads, Pro is the next step.** Name every Pro-only capability as Pro wherever it appears.

## Operating Context

- **Broadcast in:** the browser studio. It has push-to-talk (hold Space), a mic bed that ducks under the voice, a file queue and keyboard shortcuts. Pro adds BUTT, Mixxx or any Icecast source client.
- **Broadcast out:** the shareable player page, with live metadata and a listener count. Pro adds a public stream URL (TuneIn, Sonos), an embeddable player and analytics.
- **State vocabulary** (product truth; keep it consistent everywhere):
  - **LIVE**: a person is broadcasting.
  - **ON AIR**: AutoDJ is playing.
  - **OFF AIR**: nothing is playing.

## Capabilities and Constraints

- **Free, $0:**
  - 100 concurrent listeners, unlimited broadcast hours, browser broadcasting and push-to-talk, file queue, player page, live listener count and peak.
  - Plays only while the broadcaster's browser is open. **No AutoDJ.**
- **Pro:**
  - Free during beta, then $15/mo (`PRO_PRICE_USD`).
  - 24/7 AutoDJ from a 3 GB library, playlists and weekly schedule, encoder ingest, public stream URL, embed, 1,000 concurrent listeners, 90-day analytics by country, priority support.
  - **Not self-serve:** requested from the dashboard after setup and granted by hand (`PRO_AVAILABLE = false`).
- **Custom:** by hand, through a request form.
- **Stations are not a plan dimension.** Never sell a station count.
- **Never mention the "powered by GoCast" voice ID / watermark** in user-facing copy. It is shelved.
- Pro still lists a few things that are unverified (custom domain, higher bitrate). Don't add new claims beyond the current pricing lists.

## Brand Commitments

- The name is GoCast.
- The dark UI with a violet accent is shared by the marketing site, help, blog and dashboard.
- The copy uses radio vocabulary (running order, bed, ducking, drivetime, on air). It's plain-spoken and honest about limits, and it never hypes.

## Evidence on Hand

- **The official GoCast station**, a real station the homepage can play live (`client/components/homepage/heroSection/official.ts`).
- **No** testimonials, customer logos, user counts, listener totals or case studies exist. Never fabricate them.
- Real user stations from the featured API exist, but are not approved as homepage proof.

## Product Principles

1. Show it on air, don't describe it. A real station beats any mock.
2. State limits before they are discovered, especially at pricing and sign-up.
3. Free must stand on its own. Never sell a Pro feature beside a Free CTA without saying it is Pro.
4. Keep the radio vocabulary precise. LIVE, ON AIR and OFF AIR mean one thing each.
5. Nothing to install for broadcasters, nothing to sign up for listeners.
