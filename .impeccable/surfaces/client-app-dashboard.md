---
version: 1
slug: "client-app-dashboard"
primary_target: "client/app/dashboard"
related_targets: ["client/components/studio","client/components/dashboard"]
---

# Surface: Dashboard (station console), studio first

Mode: Operate. Audience: individual broadcasters and small community stations running their own station (PRODUCT.md). Task: keep a station on air, run a live show from the browser studio, manage AutoDJ music and schedule, read the audience. Frequency: daily for active hosts; the studio is used under pressure, mid-show, often on a laptop or tablet.

Constraints: inherits the "Name Your Station" world in DESIGN.md (station after dark, one violet voice, state colours with one meaning each). Free must stand on its own; Pro is named with an amber tag wherever it appears. The studio can only be rendered during a real broadcast.

Must stay untouched: product behaviour (engine, harbor, stop/handover semantics), the copy's honest-about-limits voice, stash-owned files (CreateStationButton, StationFormDialog, app/layout.tsx, components/homepage/*).

## Direction contract

THESIS: The dashboard is the station's control room, and the studio is its console: one lamp answers "is it working?" for the whole room. It refuses the category default — a shadcn card grid with a green "You're live" banner, a red "On air" strip and a grey encoder footnote all answering the same question differently.

OWN-WORLD: Near-black #08080d ground, opaque #101018 desk panels, 1px white hairlines, no glass or gradients. Colour is vocabulary only: emerald = a person live, sky = mic open, violet = AutoDJ on air and the brand's one filled button (#7f4ff0, AA), amber = Pro only, red = fault only. Bricolage for page titles, Onest for everything read, JetBrains Mono only for times, durations, URLs and keys.

STORY: A host sees at a glance whether listeners hear them, what is left on the track, and whether the mic is open — anywhere in the dashboard. A fault is the loudest thing on screen, never the quietest. A show ends with a sign-off, not a redirect.

FIRST VIEWPORT: Studio: a full-width state lamp (solid LIVE / MIC OPEN / fault chip + one sentence + uptime, listeners, kbps and seconds lost). Below, one console panel: a 44px mono time-left clock, track and loop line, 56px play between prev/next; a 72px push-to-talk pad beside a dBFS canvas meter with peak hold and a Latch toggle; the speaker monitor row. Then the running order, full height. Right rail (lg): listener count at 48px, sparkline, player link, this broadcast, shortcuts (collapsed), End broadcast.

FORM: Console strip — the recommended option of three presented (console strip / hot clock / fix in place); user delegated the choice. Seed key: none (surface inside an established world; no concept-seed roll).

Signature interaction: the lamp changing state as a whole strip (LIVE emerald → MIC OPEN sky while Space is held → red fault that blinks three times and is announced to screen readers), carried onto every other dashboard page as the banner with Unlatch.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
