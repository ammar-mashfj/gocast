---
name: GoCast
description: Internet radio from a browser tab; a dark studio with a violet accent, where every colour names a station state, a fault or a plan.
colors:
  dark: "#08080d"
  panel: "#101018"
  violet-fill: "#7f4ff0"
  violet-full: "#8b5cf6"
  violet-muted: "#a78bfa"
  violet: "#c4b5fd"
  violet-subtle: "#1f1145"
  emerald-live: "#10b981"
  emerald-signal: "#34d399"
  emerald-text: "#6ee7b7"
  sky-mic-signal: "#38bdf8"
  sky-mic: "#7dd3fc"
  fault-red: "#ff6467"
  fault-text: "#fca5a5"
  amber-pro: "#f59e0b"
  amber-pro-text: "#fcd34d"
  text-primary: "#fafafa"
  text-secondary: "#d4d4d8"
  text-muted: "#a1a1aa"
  text-faint: "#7d7d87"
  border-subtle: "#27272a"
  hairline: "rgba(255, 255, 255, 0.09)"
  input-line: "rgba(255, 255, 255, 0.13)"
  sidebar: "#0b0b12"
  popover: "#13131d"
  muted-surface: "#181822"
  secondary-surface: "#1b1b26"
  accent-surface: "#1d1d29"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Onest, ui-sans-serif, sans-serif"
    fontSize: "5rem"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Bricolage Grotesque, Onest, ui-sans-serif, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  page-title:
    fontFamily: "Bricolage Grotesque, Onest, ui-sans-serif, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  listener-count:
    fontFamily: "Bricolage Grotesque, Onest, ui-sans-serif, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.025em"
  lamp-chip:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
  pro-tag:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.05em"
  plan-tag:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.2em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
    fontFeature: "tnum"
  console-clock:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  full: "9999px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "40px"
  panel-pad: "28px"
  section-y: "112px"
  section-y-quiet: "80px"
  content-max: "72rem"
  studio-rail: "340px"
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.violet-fill}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "14px 32px"
    height: "48px"
  button-dashboard-primary:
    backgroundColor: "{colors.violet-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "36px"
  button-outline:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "44px"
  button-destructive:
    backgroundColor: "rgba(255, 100, 103, 0.2)"
    textColor: "{colors.fault-red}"
    rounded: "{rounded.md}"
    height: "44px"
  button-nav-signup:
    backgroundColor: "rgba(139, 92, 246, 0.15)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "40px"
  input-station-name:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "48px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.panel-pad}"
  onair-lamp-chip-live:
    backgroundColor: "{colors.emerald-signal}"
    textColor: "#03140d"
    typography: "{typography.lamp-chip}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  onair-lamp-chip-mic:
    backgroundColor: "{colors.sky-mic-signal}"
    textColor: "#04121c"
    typography: "{typography.lamp-chip}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  onair-lamp-chip-fault:
    backgroundColor: "{colors.fault-red}"
    textColor: "#1f0404"
    typography: "{typography.lamp-chip}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  push-to-talk:
    backgroundColor: "rgba(255, 255, 255, 0.03)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "0 20px"
    height: "72px"
  push-to-talk-open:
    backgroundColor: "{colors.sky-mic-signal}"
    textColor: "#04121c"
    rounded: "{rounded.xl}"
    padding: "0 20px"
    height: "72px"
  pro-tag:
    backgroundColor: "rgba(245, 158, 11, 0.1)"
    textColor: "{colors.amber-pro-text}"
    typography: "{typography.pro-tag}"
    rounded: "{rounded.full}"
    padding: "1px 6px"
  initials-tile:
    backgroundColor: "rgba(139, 92, 246, 0.2)"
    textColor: "{colors.violet}"
    rounded: "{rounded.xl}"
    size: "112px"
  initials-tile-unlit:
    backgroundColor: "rgba(255, 255, 255, 0.03)"
    textColor: "{colors.text-faint}"
    rounded: "{rounded.xl}"
    size: "112px"
  link-well:
    backgroundColor: "rgba(8, 8, 13, 0.6)"
    textColor: "{colors.text-muted}"
    typography: "{typography.mono}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  marker-pin:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.dark}"
    rounded: "{rounded.full}"
    size: "20px"
  state-badge-live:
    backgroundColor: "rgba(16, 185, 129, 0.1)"
    textColor: "{colors.emerald-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  state-badge-on-air:
    backgroundColor: "rgba(139, 92, 246, 0.1)"
    textColor: "{colors.violet-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  state-badge-off-air:
    textColor: "{colors.text-faint}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  plan-badge-free:
    backgroundColor: "rgba(139, 92, 246, 0.15)"
    textColor: "{colors.violet-muted}"
    typography: "{typography.plan-tag}"
    rounded: "{rounded.full}"
    padding: "2px 8px 2px 10px"
  plan-badge-pro:
    backgroundColor: "rgba(245, 158, 11, 0.1)"
    textColor: "{colors.amber-pro-text}"
    typography: "{typography.plan-tag}"
    rounded: "{rounded.full}"
    padding: "2px 8px 2px 10px"
---

# Design System: GoCast

## Overview

**Creative North Star: "Name Your Station"**

GoCast looks like the inside of a small station after dark: a near-black room, one violet desk lamp, and a station that powers on the moment it has a name. The marketing site, help, blog and dashboard share the ground, the violet accent and the three typefaces. The homepage sets out the system through one interaction. The visitor types a name, and a player-page preview beside the field goes from OFF AIR to LIVE: the initials tile lights violet, the name turns white, the level meter moves and the mono link fills in with their slug. Every section after that shows something Free does today. Pro appears once, as an optional extra, and says so with an inline tag.

Inside, the dashboard is the station's control room and the studio is its console. One lamp answers "is it working?" for the whole room: a full-width strip that is emerald while a person is live, sky while the mic is open, and red only when listeners are not hearing what the host thinks they are. The same lamp follows the host onto every other dashboard page as a banner. The console borrows radio's own instruments rather than a generic card grid: a track dial draining around the time left on the track, a dBFS mic meter with peak hold, a push-to-talk pad, a numbered running order with on-air times. A show ends with a sign-off card, not a redirect.

Colour is vocabulary rather than decoration. Emerald means a person is live. Violet is the brand, the primary action, AutoDJ on air and the Free plan. Amber means Pro. Sky means the mic is open. Red means a fault. Grey and unlit fills mean off air. Each hue answers "who is on air?", "is the mic open?", "is something wrong?" or "which plan is this?", so the system turns away any accent that carries no meaning.

Material is solid and plain. Panels are opaque (#101018) with 1px white hairlines and soft neutral drop shadows. There is no glass, no blur, no gradient and no halo. On the homepage, sections are separated by hairline rules rather than boxes; the dashboard overview follows the same idea between its groups. Density on the homepage is generous (up to 112px of vertical room per section on desktop) with copy in narrow measures (30rem to 58ch); the dashboard is denser, with 44px touch targets in the studio.

The previous homepage world, "The Broadcast Day" (2026-09-25), is retired. Its Day Ribbon and Clock Rail still exist as files in `client/components/homepage/broadcastDay/` but are not rendered. They are kept under Components as history, and nothing new should be built from them.

**Key Characteristics:**
- Near-black ground (#08080d) with opaque #101018 panels and 1px white hairlines at 6–13% opacity.
- One brand accent (violet). Emerald, sky, red and amber appear only as live, mic, fault and Pro semantics.
- Bricolage Grotesque headlines and page titles. Onest for everything read. JetBrains Mono for links, times, durations, keys and data.
- Off air looks unlit, not hatched: faint text, 3–7% white fills, meters held low.
- State changes the whole strip, not a dot: the studio lamp and its dashboard banner recolour edge to edge.
- One motion curve (exponential ease-out), 200–500ms, only on a change of state.

## Colors

A dark, near-neutral ground with one violet voice and four semantic signals: emerald for live, sky for an open mic, red for a fault and amber for Pro.

### Primary
- **Station Violet Fill** (`violet-fill`): the one filled-button colour in the dashboard (`--primary`), and the fill for the studio's play button, the overview's "Take over live" button and the sidebar's primary. It is Station Violet a step deeper so white text on it passes AA (4.9:1 where `violet-full` gives 4.2:1). Only ever a fill behind white text; never a text colour.
- **Station Violet** (`violet-full`): the brand hue for tints. The lit initials tile uses it at 20% fill with a 50% border, the nav sign-up at 15%, the Free pricing card at 6% fill with a 40% border, text selection at 35%, and the daytime AutoDJ slot in the schedule mock at 55%. Marketing surfaces still fill buttons with it (see Do's and Don'ts).
- **Soft Violet** (`violet-muted`): violet as text on dark: ON AIR labels and badges (`--color-on-air`), Free pill text, text links, the check icons on the Free card. Any violet word is Soft Violet.
- **Pale Violet** (`violet`): the second line of the hero H1, the typed name in the sign-off heading, initials on the tile, the caret, the focus ring and every focus-visible outline in the dashboard.
- **Deep Violet** (`violet-subtle`): a shared dark violet surface token.

### Secondary
- **Live Emerald** (`emerald-live`, `emerald-signal`, `emerald-text`): LIVE only, meaning a person is on the mic or broadcasting. `emerald-signal` is `--color-live`: the solid LIVE lamp chip, the studio strip at 8% fill with a 25% edge, the overview control strip's edge at 30% while a broadcaster is attached, the live bars in broadcast activity. `emerald-text` is `--color-live-text` for live copy. On the homepage: the LIVE pill (emerald-live at 10% fill, 25% border), its dot, the lit preview meter at 60%, and live shows in the schedule mock.
- **Mic Sky** (`sky-mic-signal`, `sky-mic`): the mic is open and the host's voice is going out. `sky-mic-signal` is `--color-mic`: the MIC OPEN lamp chip, the strip at 10% fill with a 30% edge, the push-to-talk pad while held, open meter segments, the Unlatch button and the mini controller's edge at 50%. `sky-mic` is `--color-mic-text` for mic copy ("Music ducked under your mic", "Going out live"). It appears only while the mic is open, or on the controls that open it.

### Tertiary
- **Fault Red** (`fault-red`, `fault-text`): listeners are not hearing what the host thinks, or something has gone wrong. `fault-red` is `--destructive` and `--color-fault`: the fault lamp chip, the fault strip at 12% fill with a 40% edge, a degraded station's control-strip edge and power dot, clipping on the mic meter, schedule clashes, and the confirm button of an irreversible action (tinted, 20% fill). `fault-text` is `--color-fault-text` for fault copy, seconds lost while dropping, errors and danger zones.
- **Pro Amber** (`amber-pro`, `amber-pro-text`): Pro only. `--color-pro` and `--color-pro-text`. Uses: the Pro tag wherever a Pro capability is shown (sidebar, share, stream panel, upsells), the inline Pro tag on the homepage's Pro heading, the Pro pricing card (4% fill, 30% border), its "In beta" tag and check icons. "Starting" is never amber; it pulses neutral.

### Neutral
- **Studio Black** (`dark`): the page ground everywhere (`--background`), the link well behind the preview's URL (at 60%) and the numeral colour on marker pins.
- **Desk Panel** (`panel`): `--card` and `--color-panel`. The opaque surface for the console, control strip, sign-off card, mini controller, players, the name preview, mocks and the name input.
- **Sidebar Black** (`sidebar`): the dashboard sidebar, half a step above the ground, edged with a 7% white hairline.
- **Popover** (`popover`): menus, popovers and a dragged running-order row, a step above the panel.
- **Muted, Secondary and Accent surfaces** (`muted-surface`, `secondary-surface`, `accent-surface`): shadcn's quiet fills for hover states, secondary badges and selected items. They carry a trace of violet so every neutral reads as one material.
- **Hairline** (`hairline`): `--border`, 1px on panels and cards. Inner dividers inside panels drop to 6%, homepage section rules and overview group rules to 7%, outer edges 9–10%.
- **Input Line** (`input-line`): `--input`, the edge of fields and outline buttons (outline buttons fill with it at 30%).
- **Zinc Line** (`border-subtle`): the solid hairline for sheet and menu dividers on the marketing site.
- **Text ladder**: `text-primary` for headings, lit names and values. `text-secondary` for marketing body copy. `text-muted` (`--muted-foreground`) for supporting copy, captions and field labels. `text-faint` for hints, small panel labels and anything off air.
- **Scrollbars** are white at 14% on a transparent track, so native chrome belongs to the room.

### Named Rules
**The One Meaning Rule.** Every hue names a state, a fault, a plan or the mic. Emerald is LIVE. Violet is the brand, ON AIR and Free. Sky is an open mic. Red is a fault. Amber is Pro. Grey is OFF AIR. If a new colour carries no meaning, keep the element neutral.

**The Red Means Wrong Rule.** Red is reserved for something wrong: listeners not hearing what the host thinks, dead air, clipping, an error, a clash, or the confirm step of an irreversible action. A healthy broadcast is never red, and neither is the button that opens a destructive flow; End broadcast is neutral and only its confirm is red.

**The Live Is Brightest Rule.** Wherever live and AutoDJ time share a view, the person on the mic gets the brightest fill (solid emerald-signal). AutoDJ steps down a violet ramp: violet-950 with a 40% violet-400 inset ring, Station Violet at 55%, indigo-300 at 70% and violet-200 at 85%. Live is never drawn as the gap in an AutoDJ day.

**The Fill Is Not Text Rule.** Violet Fill (#7f4ff0) sits only behind white text; violet words use Soft Violet. A violet that is readable as a fill is not readable as text on the dark ground, and the other way round.

## Typography

**Display Font:** Bricolage Grotesque (falls back to Onest, then sans-serif)
**Body Font:** Onest (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo)

**Character:** Bricolage is condensed and heavy at display sizes, with tight negative tracking, so headlines hit like a station ident. Onest's open, high x-height body stays calm and legible beneath it. Mono appears only where the content is a machine string or a clock.

### Hierarchy
- **Display** (700, 2.75rem on phones, then 3.75rem, 4.5rem and 5rem at 640/1024/1280px, line-height 0.95, -0.04em): the hero H1 only ("Open a tab." / "You're on air."), with the second line in Pale Violet. The sign-off heading uses the same weight and tracking one step smaller (1.875rem, then 3rem at md and 3.75rem at lg, line-height 1). When a name has been typed, the name inside it is set in Pale Violet.
- **Headline** (600, 1.875rem, then 2.25rem and 3rem at md/lg, line-height 1.05, -0.03em, max 22ch, balanced): homepage section H2s, including pricing.
- **Page title** (Bricolage 600, 1.5rem, tracking tight): every dashboard page H1 (station name, "AutoDJ", "Audience", "Broadcasts", "Station settings", "Account"). The studio's H1 is screen-reader only; the lamp is its headline.
- **Listener count** (Bricolage 600, 3rem, line-height 1, tabular): the studio rail's "Listening now" number, the one number a host reads from across the room.
- **Title** (Onest 600, 1rem to 1.25rem): card titles (via the display face in shadcn CardTitle), the console's track title (1.25rem, truncated), "Running order", studio note titles and plan names. The sign-off card's "That's a wrap." is a display-face title at 1.25rem.
- **Body** (Onest 400, 0.875rem in the dashboard; 1rem on phones and 1.125rem on desktop for homepage lead paragraphs, line-height 1.625–1.7, 30rem–58ch): all prose.
- **Label** (Onest 500, 11px, uppercase, 0.025em): homepage state pills. Dashboard field labels and meter captions are 11–12px sentence case in `text-muted`.
- **Lamp chip** (Onest 700, 13px, uppercase, 0.08em): the state word in the studio lamp (12px in the banner, 11px in the mini controller). The only bold uppercase in the dashboard, because it is the state.
- **Pro tag** (Onest 600, 11px, 0.05em, usually uppercase): the dashboard's amber Pro marker.
- **Plan tag** (Onest 600, 10px, uppercase, 0.2em, trailing padding trimmed to offset the tracking): homepage Free and Pro tags and pricing status tags.
- **Mono** (JetBrains Mono 400, 0.75–0.875rem in the dashboard, 15px for the homepage link, tabular numerals): uptime, elapsed and duration, on-air times in the running order, broadcast start times, kbps, the player link, stream keys, meter scale labels.
- **Console clock** (JetBrains Mono 500, 26px, 20px compact, tabular, full white): time left on the track, inside the track dial, prefixed with a true minus.

### Named Rules
**The Mono Means Machine Rule.** JetBrains Mono is only for URLs, slugs, times, durations, keys and data values. Never use it for headings, labels, counts, list numbers or decoration.

**The No Kicker Rule.** Headings carry their own weight. No uppercase eyebrow or kicker sits above a heading. If a section needs a plan marker, the tag sits inline after the heading text, inside the heading.

**The 11px Floor Rule.** No dashboard text is smaller than 11px. Meter scales, Pro tags and small labels sit at 11px exactly.

## Layout

The marketing content column is 72rem (`max-w-6xl`), with side gutters of 16px on phones and 40px from 768px. Breakpoints are Tailwind's defaults (640 / 768 / 1024 / 1280px).

- **Hero:** a 52/48 split from 768px, built as three grid children. The H1 and one sentence sit top left, the form sits bottom left, and the preview spans both rows on the right (max 480px, or 520px for the signed-in player). On phones the order is copy, preview, then form, so the preview stays in view above the keyboard while the visitor types. The preview's play and level-meter row is hidden below 640px so the form reaches the first screen. Copy is centred on phones and left-aligned from 768px. When signed in, the preview becomes the real official-station player and the form becomes a single "Open dashboard" button.
- **Sections (HomeSection):** each section is a heading followed by content, inside the 72rem column with a 1px top rule at 7% white. There are no boxes and no rails. Full-tone sections are padded 64px on phones, 96px at md and 112px at lg. Quiet-tone sections (used by the Pro section) are padded 56px and 80px, so the scroll has a rhythm.
- **Section interiors:** two-column splits from 1024px. TuneIn is 1:1 (prose, then the real player). Studio is 1.5:1 (the mock, then the numbered notes). Pro is 1:1.1 (prose, then the schedule mock). The gap between columns is 48–56px, and on smaller screens they stack with a 32–40px gap.
- **Pricing:** a centred heading, then a 1.35:1 grid within 64rem. The Free card is larger, with Pro and Custom stacked beside it.
- **Sign-off:** centred within 56rem and opened by a 1px top rule at 10% white.
- **Dashboard shell:** a sidebar on Sidebar Black, a 56px top bar with breadcrumb and bell, and a 24px content pad. While a broadcast runs off-studio, the LiveBanner spans the top of the content and the mini controller floats bottom right (380px; full width minus 12px on phones, above the safe area).
- **Studio:** fills the viewport under the top bar (100dvh minus 3.5rem) and never scrolls the page. The lamp spans the full width. From 1024px, a console column (deck, then running order at full remaining height) sits beside a 340px rail (listener count, sparkline, player link, this broadcast, shortcuts collapsed, End broadcast at the foot). Below 1024px it is one compact column: lamp, a Share + End row, the deck, then the running order.
- **Overview:** one sheet. The station header, then the control strip (spanning), then groups separated by 1px rules at 7% white with 32px above (activity beside recent broadcasts from 1280px; share beside the checklist from 768px). The modules inside those groups are still bordered panels, so the sheet idea is only half carried through.
- **Control strip interior:** queried by container width, not viewport. One column when narrow; power and now playing side by side from the container's 48rem; power, now playing and listeners (15rem) from 64rem.
- **Touch:** studio controls are 44px minimum (outline buttons `h-11`, transport 44px, play 56px, push-to-talk 72px).

## Elevation & Depth

Depth comes from tone plus soft neutral drop shadows, all pure black and none coloured. Panels sit one step above the ground (#101018 on #08080d), popovers a half step above that (#13131d), are edged with a white hairline, and cast a long, soft, negatively spread shadow that grounds them without a glow. Nothing is translucent over content. Dialog overlays are 80% black with no blur.

### Shadow Vocabulary
- **Panel drop** (`box-shadow: 0 24px 48px -24px rgba(0,0,0,0.9)`): the console deck, the control strip, the sign-off card, the mini controller, the name preview, players, product mocks and the Free pricing card.
- **Artwork drop** (`box-shadow: 0 18px 40px -12px rgba(0,0,0,0.7)`): station artwork inside a panel.
- **Button drop** (`box-shadow: 0 8px 18px -8px rgba(0,0,0,0.8)`): filled violet buttons, the play button and the studio's 56px play.

### Named Rules
**The Solid Panel Rule.** Surfaces are opaque with a 1px white hairline. Don't use glass, backdrop blur, gradients, halos or coloured glow shadows on surfaces. Shadows are neutral black and only ground a surface. The one light that glows is an indicator: hot and clipping mic-meter segments glow (6px, their own colour) while the mic is open, the way a meter LED does.

## Shapes

Shapes are softly rounded rectangles, with full pills for anything that labels a state and full circles for pins and play buttons. Radii come from the shared `--radius` of 10px:
- **Homepage buttons, the name input, the link well:** 10px.
- **Dashboard buttons, lamp chips, menu items:** 8px.
- **Initials tiles, the push-to-talk pad, the mini controller, Pro and Custom pricing cards:** 14px.
- **Console deck, running order, control strip, sign-off card, players, the name preview, mocks, the Free card:** 18px.
- **State pills, plan and Pro tags, status tags, marker pins, play buttons:** full.
- **Schedule rows:** 4px, with slots at 2px. Mic-meter segments: 1.5px.

Borders are always 1px. No border is thicker on one side than the others. State tints the whole edge of a strip or panel, never a stripe. Off air has no pattern of its own. It is drawn unlit: a 3% white fill with an 8% border on the tile, faint text, and meter bars at 6–7% white.

## Components

### Buttons
Buttons are confident and single: each view has one filled button.
- **Shape:** 10px and at least 48px tall on the homepage; 8px and 36px by default in the dashboard, 44px in the studio.
- **Primary:** Violet Fill with white text. On the homepage, Onest 600 at 1rem, 14px × 32px padding (24px sides beside the name input), button drop shadow; labels are "Create a free station" signed out and "Open dashboard" signed in. In the dashboard it is the one action that matters on the view ("Take over live", "Go live", play).
- **Hover / Focus:** homepage buttons brighten 110% and lift 1px; dashboard fills drop to 80%. Focus is Pale Violet: a 2px outline offset 2px on the homepage, a 2px ring at 30% plus a Pale Violet border in the dashboard. Pressed buttons sink 1px.
- **Outline (dashboard secondary):** Input Line edge, input fill at 30%, white text. Transport prev/next, Latch, Add files, Share, End broadcast.
- **Destructive:** red tinted at 20% with red text, never solid. It appears only as the confirm inside a dialog or a danger zone.
- **Nav sign-up (homepage secondary):** violet at 15% with a 50% violet border and white text, 40px tall, visible on phones as well. On hover the fill rises to 25% and the border goes solid.
- **Play:** a circular violet button (44–56px) with the button drop shadow and a filled play icon, disabled at 40–50% opacity when there is nothing to play.
- **Text link:** Soft Violet, underlined on hover (dashboard); white with a 30% underline on the Custom card.

### Chips
- **State pill (StateBadge):** the homepage and player surfaces' state mark, with a 6px dot. LIVE uses emerald at 10% fill with a 25% border and emerald-text. ON AIR uses violet at 10% fill with a 30% border and violet-muted text. OFF AIR has only a 10% white border and text-faint. An optional detail follows the label after a middle dot ("On air · AutoDJ"). The dot pulses only for a signal that is actually live.
- **Control strip headline pill:** ON AIR in Soft Violet at 10% with a 30% border, "Not reaching listeners" in red at 10% with a 40% border, off air and "Coming on air" in a 10% white border with muted text. The power dot beside the station badge is emerald only while a person is attached, violet for AutoDJ, neutral pulsing for starting, red for degraded, grey at 40% off air.
- **Pro tag (dashboard):** amber at 10% fill with a 30% border and amber-pro-text, 11px semibold, full pill, sitting after the thing it marks. Never solid, never larger than its label.
- **Plan tag (PlanBadge, homepage):** a tinted fill with a matching border and text, never solid. Free uses violet at 15% with a 50% border. Pro uses amber at 10% with a 30% border. The tag is a footnote and must never outweigh the heading it annotates.
- **Status tag (pricing cards):** plan-tag type in the card's own tint, with a 6px dot for "Available now" and "In beta" and a neutral 14% border for "By hand".
- **Playing (running order):** a neutral pill, 15% white border, white text. Playing is not a state colour.

### Cards / Containers
- **Corner Style:** 18px for product panels, 14px for secondary cards.
- **Background:** Desk Panel (#101018), opaque. Plan cards take their plan's tint instead: violet at 6% for Free, amber at 4% for Pro and neutral white at 3% for Custom. Danger zones take red at 3% with a 30% red edge.
- **Shadow Strategy:** panel drop (see Elevation).
- **Border:** 1px white at 9%, or the tint of whoever is on air (see Control Strip).
- **Internal Padding:** 16–24px in the dashboard (compact 16px); 20px on phones and 28px on desktop on the homepage. Inner dividers are 6% white hairlines.
- **Examples:** every marketing mock is labelled as an example, with "(an example)" in its title or a `text-faint` figure caption. The real station player carries no such label.

### Inputs / Fields
- **Station name input:** Desk Panel fill, 12% white border, 10px radius, 48px tall, 16px sides, white 1rem text, faint placeholder, violet caret. It has a visible Onest 500 0.875rem label above it ("Name your station") and a faint 0.75rem hint below it.
- **Dashboard fields:** Input Line edge, 8px radius, Pale Violet ring on focus; invalid fields take a red edge and ring.
- **Hover / Focus:** the border rises to 20% on hover and turns violet on focus. Keyboard focus adds a 2px Pale Violet outline, offset 2px.

### Navigation
- **Marketing:** a logo on the left and text links on the right (Onest 1rem, white, slight tracking). "Sign in" is muted and hidden on phones, and the nav sign-up button closes the row at every width. On mobile a 44px icon trigger opens a right-hand sheet (280px) on the page ground with 8px-radius items that go white on a 5% white fill on hover, with `border-subtle` dividers above the account actions.
- **Dashboard sidebar:** Sidebar Black, icon + label items, the current page on the accent surface. While a broadcast runs, the Studio item carries a small LIVE mark in emerald. Pro items carry the Pro tag.

### OnAirLamp (dashboard signature)
The studio's one answer to "is it working?". A full-width strip under the top bar whose whole surface takes the state: LIVE (emerald at 8%, 25% edge), MIC OPEN (sky at 10%, 30% edge) or a fault (red at 12%, 40% edge). On the left, a solid chip in the state's colour with near-black text of the same hue (`#03140d`, `#04121c`, `#1f0404`), a current-colour dot, and the state word; beside it one sentence in the state's text colour. On the right: uptime in mono, the listener count, and kbps in mono with "· N.Ns lost" (red while dropping). Healthy chips settle in (220ms) and their dot pulses; a fault chip blinks three times (0.7s) and its dot holds still. A screen-reader-only paragraph keyed on the state code announces each change once: `role="status"` for healthy, `role="alert"` for faults. Compact below 1024px, with the stats wrapping to a full-width row.

### LiveBanner and BroadcastMiniController
The lamp carried onto every other dashboard page while a broadcast runs from this tab. The banner uses the same three tones and the same chip (28px, 12px text), says "You're broadcasting from this tab — closing it ends the show." when healthy, and offers a solid sky **Unlatch mic** button whenever the mic is latched open, plus "Open studio". The mini controller is a 64px Desk Panel floating bottom right: a 36px state square (solid sky with a mic icon when open, emerald at 15% with a broadcast icon when live), the state word with the listener count, the track title, and play/next. Its edge turns sky at 50% while the mic is open.

### OnAirDeck (console panel)
One 18px Desk Panel with the panel drop, in three bands split by 6% hairlines:
1. **Transport:** the track dial (148px, 116px compact) around the console clock and "left", separated from the rest by a hairline; the track title and artist; a read-only 6px progress bar (white at 80%, dimmed to 35% while the mic ducks the music) between mono elapsed and duration; and one line of what happens next ("Then {next} · 9m until the queue loops", or "Music ducked under your mic" in sky). Prev and next are 44px outline icons; play is a 56px Violet Fill circle.
2. **Mic strip:** the push-to-talk pad, the mic meter with its caption ("Level check · not going out" / "Going out live" in sky) and device name, and the Latch toggle. The band tints sky at 5% while the mic is open. Omitted entirely for music-only broadcasts.
3. **Monitor row:** the speaker monitor slider, "Your speakers only — never the stream".

### TrackDial
One ring, one meaning: the track on air. It is full when the track starts and drains clockwise from 12 o'clock to empty as it plays (8px stroke, 6px compact, round caps; white at 80% on an unlit 7% track, going full white under 20 seconds). The console clock and "left" sit in its clear face. Talk-up cues at 20s and 10s: the dial pulses once (scale 1.06, 520ms, the house curve) and "left" becomes bold "get ready"; each cue is announced to screen readers. The canvas is decorative (`aria-hidden`); the number carries the meaning. Canvas on its own animation frame loop; nothing re-renders to move it.

**Retired: the two-ring hot clock (2026-09-26).** An outer wall-clock-hour ring (aired history in grey, sky and red, the queue forecast ahead of a white hand) around an inner track ring. Hosts couldn't tell what either ring meant mid-show, and the inner ring repeated the progress bar. Don't bring back an unlabelled second ring.

### MicMeter
A 40-segment canvas meter in dBFS from −60 to 0, tapped off the microphone before the talk gain, so it reads whether or not the mic is open. Closed, lit segments are white at 32% (a level check, nothing going out). Open, they are Mic Sky, near-white (#e0f2fe) from −6 to −1, and red above −1, with hot and clipping segments glowing. Unlit segments are white at 6%. A 2px peak marker holds for 1.2s before falling. A mono 11px scale sits below at −48, −24, −12, −6 and 0. Exposed as `role="meter"` with the level spoken every 750ms.

### PushToTalk pad
A 72px pad (14px radius) with a 40px mic disc, "Hold to talk" and a hint that matches the input: "Hold Space · music ducks under you" for keyboards, "Press and hold · music ducks" for coarse pointers. At rest: white at 3% with a 12% edge, sky-tinted disc. Held: solid Mic Sky with near-black text, scaled to 0.99, reading "You're on mic" / "Let go to close" (or "Mic latched open" / "Unlatch to close"). Pointer events with capture, so a finger that slides off the pad keeps the mic open until it lifts. Space and Enter hold it from the keyboard. Latch holds it hands-free and tints sky while on.

### Running order (FileQueue)
A full-height panel headed "Running order" with a count, total duration and storage used, a Loop all / Hold track segmented toggle, and Add files. Rows are a grid: a drag handle (the only drag target), a position number, title and artist, the time the track will air in mono (wrapping past the loop) or a neutral "Playing" pill, the duration in mono, and remove. The playing row sits on white at 4% with a semibold title. Removing or clearing shows a toast with Undo, and the rows glide to their new places through a view transition (260ms). An empty queue is a dashed 12% drop zone.

### EndBroadcast
A neutral outline button with a stop icon ("End broadcast", or "End" compact), at the foot of the rail or in the compact Share row. It opens a dialog that states the consequence; the dialog's confirm is the only red button in the studio, and it cannot be dismissed while the stop is in flight.

### ShowSignOff
The end of a show as a moment: a Desk Panel card at the top of the overview, shown once. "That's a wrap." in the display face, one line on what the station does now (AutoDJ picks back up, or off air), then three facts: On air, Peak listeners, Audio lost ("None" when clean). The card rises (500ms) and the facts land in turn (180ms, then 70ms apart). Dismissible.

### StationPower control strip
The overview's instrument: one 18px Desk Panel in up to three parts split by hairlines: power (the headline pill, what the state means for a listener, and the one filled action), now playing (source label, track, progress, up next), and listeners (count, "View audience"). The panel's whole edge takes the colour of whoever is on air: emerald at 30% with a broadcaster attached, violet at 25% for AutoDJ, red at 40% when degraded, the plain 9% hairline off air. The edge changes over 300ms.

### Station Name Preview (homepage signature)
A player-page preview that lights up as the visitor names it. It is a Desk Panel (max 480px) with a StateBadge and a faint "Player page" label on top. Below that is an initials tile (84px on phones, 112px from 768px) beside the name and a one-line status. Next is a play button and a 24-bar level meter, hidden on phones, and last a link well showing `host/station/slug` in mono.
- **Unlit (no name):** OFF AIR pill, a tile at 3% white with an 8% border holding a faint radio icon, "Your station" in faint text, "Off air until you name it", a grey play disc, meter bars at 7% white held at 18% height, and a faint slug.
- **Lit (first keystroke):** a LIVE pill with a pulsing dot, and a tile at 20% violet with a 50% violet border and Pale Violet initials (two letters, in the display face at 700). The name turns white, the status reads "Live from a browser tab", the play disc turns Station Violet, the meter bars go emerald at 60% and animate, and the slug turns white. Every colour change runs over 500ms.
- **Slug:** previewed client-side to match the server's slug rule. The caption says a number is added if the link is taken.
- **Carry-through:** the name is saved to localStorage (debounced 300ms) as it is typed. The sign-off heading repeats it ("Put {name} on air tonight.", with the name in Pale Violet) and falls back to a generic line on the server render. The dashboard's create dialog opens pre-filled with it and clears it after creation.

### Initials Tile
The stand-in artwork for a station that has no image yet: 14px radius, violet at 20% with a 50% violet border, and two Pale Violet initials in the display face at 700 with -0.04em tracking. It appears in the name preview and, at 56px, in the studio mock ("NB"), so the mock reads as the visitor's own station later on.

### Marker Pin (studio notes)
A 20px white circle with a dark 11px numeral (semibold). Pins 1–3 sit on the studio mock at the track countdown, the mic and the listener count, and the same pins lead the numbered notes beside it. This pairing is the page's only point list. Future pins should set the numeral in Onest, not mono.

### Schedule Mock (Pro)
A Desk Panel labelled "Schedule (an example)" with an "On air · AutoDJ" pill. It shows seven day rows (28–32px tall, 4% white track, 6% hour ticks at 06/12/18) and hour labels in 11px muted tabular Onest. Slots follow the Live Is Brightest Rule. A slot that runs past midnight is drawn as two segments. A legend with 10px swatches sits below a 5% divider.

### Motion
One curve for the whole dashboard, `cubic-bezier(0.16, 1, 0.3, 1)` (exponential ease-out), at 200–500ms, and only on a change of state; nothing enters on page load. Strip and band colour changes run 200ms, the control strip's edge 300ms, a changed lamp chip settles in 220ms (scale 0.92 to 1), running-order reflow 260ms, a talk-up cue 520ms, the sign-off card 500ms with staggered facts. The one exception to the curve is the fault blink: three 0.7s pulses, so a fault never looks like a healthy settle. Under reduced motion every one of these holds still: no settle, no rise, no blink, no pulse, no view transition, and the talk-up cue is announced but not animated.

### Retired: Day Ribbon and Clock Rail (not rendered)
These are from "The Broadcast Day" (2026-09-25), which the user rejected because it framed Free as the gaps in a Pro day. Their files remain in `client/components/homepage/broadcastDay/`, and nothing renders them.
- **Day Ribbon:** a 24-hour example day drawn to scale, with LIVE at emerald 75%, ON AIR at violet 60%, and OFF AIR as a 135° hatch. A white "Now HH:MM" marker with a knockout ring swept in over 1400ms, and a segmented "Free + Pro / Free only" toggle re-rendered the AutoDJ hours as hatch.
- **Clock Rail:** a sticky 8.5rem left rail on a 1px hairline, with a 24px mono time, a paired state and plan pill, and a 12px knocked-out dot heading each section.
- **Also retired with them:** the Paired Label Rule (state and plan pills always together), the off-air hatch, the knockout-ring shadow, the segmented toggle and the rail-time mono size. Don't revive them for new surfaces.

## Do's and Don'ts

### Do:
- **Do** use Violet Fill (#7f4ff0) as the only filled-button colour, with one filled button per view.
- **Do** draw station state with StateBadge on public surfaces, and with the OnAirLamp (studio), LiveBanner (elsewhere in the dashboard) and control-strip edge on the overview.
- **Do** change the whole strip or panel edge when state changes, with a solid chip in the state's colour and dark text of the same hue.
- **Do** announce every state change to screen readers once: `status` for healthy, `alert` for faults.
- **Do** mark Pro with an amber tinted tag wherever a Pro capability is shown.
- **Do** build surfaces as opaque #101018 panels with a 1px white hairline (8–10%) and the neutral panel drop shadow.
- **Do** separate homepage sections, and overview groups, with a 7% hairline rule, not boxes.
- **Do** set URLs, slugs, times, durations, keys and data values in JetBrains Mono with tabular numerals, and nothing else.
- **Do** keep studio controls at 44px or larger, and write hints for the input the host is actually using (Space on keyboards, press and hold on touch).
- **Do** draw off air as unlit: faint text, 3–7% white fills, meters held low.
- **Do** give a person's live time the brightest fill in any schedule, with AutoDJ in the violet ramp below it.
- **Do** label every mock or illustrative screen as an example, and let only the real station go unlabelled.
- **Do** animate only on a change of state, on the house curve, and give every animation a reduced-motion fallback that holds a meaningful static state (level meters freeze at mid-level, not flat).

### Don't:
- **Don't** put an uppercase eyebrow or kicker above a heading. A plan tag goes inline, after the heading text.
- **Don't** colour a healthy state red, and don't make the button that opens a destructive flow red. Red is for faults, errors, clashes and the final confirm.
- **Don't** use amber for anything but Pro, including "starting" or "warning".
- **Don't** use glass, backdrop blur (including on dialog overlays), gradients, halos or coloured glow shadows on surfaces.
- **Don't** mark state or emphasis with a side-stripe border; tint the whole edge.
- **Don't** set violet text in Violet Fill; use Soft Violet.
- **Don't** colour an AutoDJ slot emerald or a live slot violet. Emerald is only for a person on the mic.
- **Don't** introduce an accent hue that doesn't name a state, a fault, a plan or the mic.
- **Don't** set a plan or Pro tag as a solid fill. It is a tinted footnote.
- **Don't** set dashboard text below 11px.
- **Don't** pulse a live dot for anything that isn't actually live, and don't pulse a fault; faults blink three times and hold.
- **Don't** make the track position scrubbable on air; the progress bar is read-only.
- **Don't** build new surfaces from the retired Day Ribbon or Clock Rail.
