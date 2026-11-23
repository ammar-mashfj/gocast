# Product gaps found while writing the use-case pages

Started 2026-11-23. Ideas only, nothing built. While writing each `/for/<audience>`
page we check every claim against the code, and some audiences want things
GoCast doesn't do. Each gap is written here so we can come back to it, along with
what the page says today (so the page can be updated when the gap closes).

---

## 1. Separate presenter logins (community radio)

**The gap.** A station has exactly one account. There is no team, member or
presenter model (`api/app/Models`: no such table). Community stations with
several volunteer presenters share one login.

**What the page says today** (`/for/community-radio`, FAQ "Can each presenter
have their own login?"): "Not yet." Presenters sign in with the station's
account, whoever holds it is responsible (Terms §3), share it only with people
you trust, change the password when someone leaves.

**Why it matters.**
- Sharing a password is the first objection a community group will raise.
- No way to remove one presenter without logging everyone out.
- The station's owner can't see who went live (the event log knows the browser
  and IP of a broadcast, not the person).

**What already helps.** The station takes one live source at a time, and the
Go live page of a second presenter waits and opens by itself when the first
show ends (`client/app/dashboard/stations/[slug]/live/page.tsx`, polls every 3s).
So the handover works; only the identity is missing.

**Open questions before building.**
- Scope: can a presenter only go live, or also upload / edit the schedule?
- Free or Pro? (Pro is simpler: presenters are a "station run by a group" need.)
- Invite by email link vs. owner creates the login.
- Show "who is on air" on the player (presenter name) — ties into gap 2.

---

## 2. A public schedule listeners can see (community radio, also news, churches)

**The gap.** Listeners can't see what's on when. Show times
(`station_schedules`) were removed from the web app on 2026-10-18 because
"no one is using it" and they confused owners: some set show times expecting
AutoDJ to run. The table, the API and the mobile screen still exist.

**What the page says today** (`/for/community-radio`, FAQ "Can listeners see
our programme schedule?"): "Not on the GoCast player: it shows what's on air
now." Post the line-up on your website or social pages.

**Why it matters.**
- Community radio, news and churches all run on fixed times; listeners ask
  "when is the Sunday service / the folk show on?"
- A schedule on the player page is also SEO content (show names, times) on
  pages that are otherwise thin.

**Lesson from last time.** Don't bring back a separate "show times" list that
does nothing. If it comes back, it should come from something that already
runs: the AutoDJ slots (Pro) are real, timed and named, so a "Coming up" on
the player could be built from them, plus optional live-show entries that are
clearly marked as "live show (the presenter goes live)".

**Open questions before building.**
- Source of truth: AutoDJ slots only, or slots + manually entered live shows?
- Free stations have no slots: do they get manual entries, or nothing?
- Timezone: shown in the listener's time or the station's?

---

## 3. A private or unlisted station (schools, also churches)

**The gap.** Every station is public. The Terms (§4) say so: "there is no
private or unlisted mode today", and any station can be listed in the
directory and featured on the homepage.

**What the page says today** (`/for/student-radio`, FAQ "Can we keep the
station private to the school?"): "No." Plus a teacher checklist: first names
only on air, nothing that locates a student, a staff member holds the account.

**Why it matters.**
- Schools with under-18s are the first to ask; some will not start without it.
- Churches and small groups sometimes want "members only" too.

**Options, cheapest first.**
- Unlisted: never in the directory, sitemap or homepage features; `noindex` on
  the player page. The link still works for anyone who has it.
- Link with a secret token (unguessable URL), rotatable.
- Password or sign-in to listen (heavier: changes the "listeners need no
  account" promise).

**Open questions.** Free or Pro? Does unlisted also hide the station from the
public stations sitemap (`/station/sitemap.xml`, `scopeIndexable`)? It should.

---

## 4. Upload by API (AI stations, also labels and newsrooms)

**The gap.** Tracks can only be uploaded through the dashboard. There is no
public API or personal upload token (Sanctum tokens exist, but only for the
web and app sign-in). Dropping a folder is not supported either: the library
takes many files at once, but not a directory.

**What the page says today** (`/for/ai-radio`): "Select or drag in dozens of
files at once". Nothing about automation.

**Why it matters.**
- AI stations generate tracks in batches from scripts; they want to push new
  tracks without opening a browser.
- Newsrooms want to replace the hourly bulletin file automatically
  (`/for/news` FAQ tells them to upload and remove by hand).
- Labels with large catalogues.

**Options.** A per-station upload token (scoped to tracks only, rotatable like
the stream key) on the existing `POST /stations/{slug}/tracks`; later, a
"replace this track's file" endpoint for bulletins. Folder drop in the library
(`webkitGetAsEntry`) is a small, separate win.

---

## 5. Right-to-left names on the player, and a translated dashboard (diaspora)

**Small: RTL alignment on the player.** The player page
(`client/app/station/[slug]/PlayerView.tsx`) sets no `dir="auto"` on the
station name, description or track title. Arabic glyphs render (the marketing
surface falls back to IBM Plex Sans Arabic), but a right-to-left name sits
left-aligned and mixed strings can put punctuation on the wrong side. The
`/for/diaspora-radio` demo uses `dir="auto"`, so the real player should too.
A few attributes; worth doing before the Mosques page (planned Arabic version).

**Large: the dashboard is English only.** No i18n library, no message files.
The page says so ("The dashboard: English for now"). Arabic, Spanish and
Portuguese are the obvious first languages from the prod station list.

---

## 6. Prayer-time scheduling (mosques)

**The gap.** AutoDJ slots repeat weekly at fixed clock times. Prayer times
move every day (and differ by city and calculation method), so a station
can't play the adhan, or a recitation block, "at Maghrib".

**What the page says today** (`/for/mosques`, FAQ "Can the station play the
adhan at each prayer time?"): "Not by itself." Mosques go live for the adhan.
The day ribbon labels live moments by prayer ("After Fajr"), not by clock.

**Why it matters.** It's the one thing a mosque station would want automated,
and no general radio host does it: a real differentiator for this audience.

**Sketch.** A slot type "at prayer time" (Fajr/Dhuhr/Asr/Maghrib/Isha ± offset)
resolved daily from the station's coordinates and a calculation method (MWL,
ISNA, Umm al-Qura, Egyptian…), using a prayer-times library server-side, fed
into the same on-time (hard) start path that bulletins use. Builds on gap #2's
schedule work.

---

## Related

- `docs/USE-CASE-PAGES-PLAN.md`: the pages themselves.
- Memory: `show-times-in-settings` (why show times were removed).
