# Caster.fm vs GoCast — feature gap analysis

What Caster.fm offers that GoCast does not, which of those gaps matter, and
why. Written 2026-09-25 from Caster.fm's public pages (sources at the end)
and GoCast `main` at `3d2c774`. GoCast claims below were checked in the
code, not taken from docs.

Follow-up plan for the top item: [STATION-CMS-PLAN.md](STATION-CMS-PLAN.md).

## 1. Caster.fm's plans

| | Free | Cloud Plus | Pro |
|---|---|---|---|
| Price | $0 | $34/mo | $80+/mo |
| Listener slots | 400 | 1,000 | Unlimited |
| Bitrate | ≤ 96 kbps | ≤ 128 kbps | ≤ 320 kbps |
| Idle shutdown | 15 min | 15 min | 15 min |
| AutoDJ | ✓ (basic) | ✓ | ✓ "Smart AutoDJ" |
| Real-time analytics + royalty reports | ✓ | ✓ | ✓ |
| Live recording | 7 × 1 h | Limited | ✓ |
| Multiple mounts | ✗ | Add-on | ✓ |
| Relays | ✗ | ✗ | ✓ |
| Podcasts | ✗ | ✗ | ✓ |
| Radio website CMS | ✗ (basic pages, ads) | ✓ | ✓ + ads |
| Mobile apps + Alexa skill | ✗ | ✓ | ✓ |
| 3rd-party directories | ✗ | ✓ | ✓ |
| Support | Tickets | Tickets | Priority + live chat |

Caster contradicts itself on AutoDJ: its compare table puts AutoDJ on every
plan, while its Pro page sells "Smart AutoDJ" as Pro-only. Most likely
there is a basic AutoDJ everywhere and a smarter one on Pro; this is not
confirmed.

GoCast for comparison: Free $0 / Pro $15, with a cap on concurrent
listeners only (see the pricing strategy).

## 2. What they have that we don't

### Station website (CMS)
News editor that embeds Facebook, Instagram, TikTok and YouTube posts;
staff/DJ pages; show and special pages; social media feeds; listener
accounts that can comment and like; live chat; song requests; ads on the
site (Pro only).
**GoCast:** `/station/[slug]` (player, description, schedule block,
related stations) and the Pro embed. No posts, pages, chat, requests or
listener accounts.

### Stream output
- Up to 320 kbps. **GoCast:** MP3 128k + one HLS AAC 128k variant
  (`api/resources/views/liquidsoap/station.blade.php:1280`, `:1388`).
- MP3, AAC+, OGG Vorbis, Opus, FLAC. **GoCast:** MP3 and AAC only.
- Multiple mounts per station. **GoCast:** one.
- Adaptive HLS with several quality levels. **GoCast:** one level; the
  template notes "add a 64k variant later for cellular ABR".
- Relays in and out. **GoCast:** none.

### Live DJ tooling
- DJ accounts with their own credentials and slots. **GoCast:** one owner
  per station.
- Web DJ: two decks, a crossfader and a mic in the browser.
  **GoCast:** Studio = mic + AutoDJ.
- Automatic cloud recording of live shows and on-demand replays.
  **GoCast:** no recording output in the station template.
- Podcast hosting with RSS.

### AutoDJ depth
They have weights per playlist, timed-interval playlists ("every N songs /
X minutes"), no-repeat artist separation and listener requests.
**GoCast:** playlists, weekly slots, deck shuffle, jingles and crossfade,
but none of those four.

### Reporting, apps, distribution
- SoundExchange-compatible royalty reports (required for US webcasters).
- Per-song impact on listener count, peak hours, CSV export.
- Branded iOS/Android apps, Alexa skill.
- Submission to TuneIn and other directories.
- Integrations with Discord, Telegram, Mastodon, Bluesky, GA and Matomo,
  plus generic webhooks.
- Public API for controlling the server.

### Where they are NOT ahead
- Encoder support. We take BUTT and Mixxx over the TCP router.
- Analytics. Our real-time counts and country/device breakdown are roughly
  equal to theirs (geo depends on Cloudflare).
- Idle shutdown. They stop idle servers after 15 minutes on every plan.
- Price. Their Free plan is 96 kbps and runs ads on your site; their paid
  plans are $34 and $80+ against our $15.

## 3. Multiple streams — is it worth it?

"More than one stream" covers two different things:

1. **The same audio in several encodings** (64k AAC / 128k MP3 / 320k MP3).
   This serves weak mobile connections, listeners who want better sound,
   MP3-only hardware radios, and directories that list quality options.
   HLS already does the per-connection switching for everyone on our own
   player, but only if it has more than one level. Separate fixed mounts
   only help external players (VLC, smart speakers, hardware radios,
   TuneIn).
2. **Different programming per stream** (a "Chill" channel, a second
   language). Caster sells this as an add-on because it counts stations
   per plan. Stations aren't a GoCast plan dimension, so a second channel
   is already just a second station.

**Cost:** each extra encoding is one more always-on Liquidsoap encoder per
station, whether anyone is listening or not. That adds up fast with many
stations per host.

**Decision:**
- Add the 64k HLS variant for everyone.
- Offer a 192–320k MP3 mount as a Pro feature.
- Skip Opus, FLAC and OGG, and skip channels.

## 4. Priority — by importance, not build cost

Ranked by how much each gap decides whether a station picks GoCast and
stays:

1. **Station website / CMS.** Originally ranked 4th as "chat and
   requests". Moved to first because it is the frame the other top items
   plug into: shows are already schedule rows, DJ accounts become the team
   page and post authors, replays hang off show pages, and chat and
   requests live on the home page. Many small stations have no site at all
   (a Facebook page and a stream URL). Every post and show page is also an
   indexable page. Plan: [STATION-CMS-PLAN.md](STATION-CMS-PLAN.md).
2. **DJ team accounts.** A yes/no requirement for college and community
   stations. Without it they cannot move to us, however good the rest is.
3. **Recording and replays.** Most of a show's audience isn't live.
   Replays build a weekly following and every past show becomes an
   indexable page. This is already top of
   [GROWTH-FEATURES-2026-09-23.md](GROWTH-FEATURES-2026-09-23.md).
4. **Distribution outside our site:** TuneIn and Radio Browser submission,
   Alexa, car players. Directory submission gets most of the reach without
   building apps.
5. **Listener interaction: chat and song requests.** Turns listeners into
   regulars and gives DJs a reason to go live. Delivered as part of the
   CMS home page.
6. **Royalty reporting (SoundExchange).** A legal requirement for US
   stations playing commercial music, and a hard blocker for that segment.
7. **Pro bitrate 192–320k.** Not a reason to join, but a 128k cap is a
   reason to leave.

**Not worth chasing:** extra codecs, relays, the Web DJ deck, podcast
hosting, ads on station sites, native branded apps, generic webhooks.

## Sources

- https://www.caster.fm/
- https://www.caster.fm/compare/
- https://www.caster.fm/professional-stream-hosting/
- https://www.caster.fm/free-cloud-stream-hosting/
- https://www.caster.fm/professional-stream-hosting/packages-pricing/
- https://www.cloudrad.io/compare/caster-fm
