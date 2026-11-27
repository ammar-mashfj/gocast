# Use-case pages — plan

Decided 2026-11-21 (discussion only, nothing built).

Goal: more reach. One page per audience (e.g. `/for/churches`), plus a
"Who it's for" strip on the homepage linking to them.

## Rule for every page

Each page must be genuinely different — not one template with the noun
swapped (Google treats that as doorway pages, and readers don't buy it).
Each page gets:

- a real scenario ("Friday khutbah goes live at 1pm, recitations the rest of the week")
- real screenshots of the features that audience uses
- 3–4 features picked for them
- an FAQ answering their actual questions
- a CTA (Free by default; Pro where the use case needs Pro)

Before writing copy: draft a one-paragraph scenario per audience and agree the angle.

## Batch 1 — 10 pages

1. **Churches** — live sermons/services, worship music between them.
2. **Mosques** — live khutbah and lessons, Quran recitation 24/7. Candidate for an Arabic version.
3. **Community radio** — local groups, several presenters, set show times.
4. **School & university radio** — student stations, including student news.
5. **DJs** — live mixes from the browser studio (Free), or Mixxx/Traktor via the encoder (Pro). Needs one honest line: DJs are responsible for licensing the music they play.
6. **AI-generated stations** — 24/7 AI-made music or shows on AutoDJ.
7. **Musicians & labels** — a 24/7 station of your own catalogue; no licensing problem.
8. **Diaspora & language radio** — stations for communities abroad, in their own language.
9. **News** — hyperlocal, independent and exile journalists; bulletins on the hour, AutoDJ in between. Confirm what on-time starts / hard slots actually do on prod before promising "exactly on the hour".
10. **FM stations (simulcast)** — put your FM station online via the encoder. **Pro-only** (encoder is gated: `StreamKeyController.php:45`, `HarborAuthController.php:113`) — say so upfront, CTA is Get Pro.

## Batch 2 — later

- Cafés & restaurants — framed as "your café's own station" (open mics, local bands, events), not background music. One line: venues playing commercial music need their own local music licence; GoCast doesn't provide one.
- Local sports commentary (amateur clubs/leagues)
- Pop-up event radio (festivals, conferences, charity marathons)
- Lo-fi / study / sleep stations
- Hospital radio

## Left out

- In-store / business background music — public-performance licensing problem.

## Licensing position (decided)

- **No licensing route.** GoCast stays a host; station owners are responsible for licensing their own content (same as Radio.co, Caster.fm).
- Never supply commercial music from GoCast (no built-in hit playlists). Anything GoCast itself provides must be owned or explicitly licensed for platform redistribution (own jingles, AI music with commercial rights, carefully-checked royalty-free).
- Streaming licences are territorial and follow where listeners are; the station owner licenses for their audience.

## Open follow-ups (not page work)

- Check the Terms clearly put content licensing on station owners.
- Check there's a published takedown contact + routine (keeps host protection: DMCA / EU DSA).
