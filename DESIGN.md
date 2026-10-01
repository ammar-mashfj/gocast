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
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.violet-fill}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "14px 32px"
    height: "48px"
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

Inside, the dashboard is the station's control room and the studio is its console. Since 2026-10-01 it is built on the **GoCast Design System** (shared with the mobile app), with its own palette, type and components: see **The dashboard** at the end of this file. Every other section describes the marketing site, help, blog and public player.

Colour is vocabulary rather than decoration. Emerald means a person is live. Violet is the brand, the primary action, AutoDJ on air and the Free plan. Amber means Pro. Red means a fault. Grey and unlit fills mean off air. Each hue answers "who is on air?", "is the mic open?", "is something wrong?" or "which plan is this?", so the system turns away any accent that carries no meaning.

Material is solid and plain. Panels are opaque (#101018) with 1px white hairlines and soft neutral drop shadows. There is no glass, no blur, no gradient and no halo. On the homepage, sections are separated by hairline rules rather than boxes. Density on the homepage is generous (up to 112px of vertical room per section on desktop) with copy in narrow measures (30rem to 58ch).

The previous homepage world, "The Broadcast Day" (2026-09-25), is retired. Its Day Ribbon and Clock Rail still exist as files in `client/components/homepage/broadcastDay/` but are not rendered. They are kept under Components as history, and nothing new should be built from them.

**Key Characteristics:**
- Near-black ground (#08080d) with opaque #101018 panels and 1px white hairlines at 6–13% opacity.
- One brand accent (violet). Emerald, red and amber appear only as live, fault and Pro semantics.
- Bricolage Grotesque headlines and page titles. Onest for everything read. JetBrains Mono for links, times, durations, keys and data.
- Off air looks unlit, not hatched: faint text, 3–7% white fills, meters held low.
- One motion curve (exponential ease-out), 200–500ms, only on a change of state.

## Colors

A dark, near-neutral ground with one violet voice and three semantic signals: emerald for live, red for a fault and amber for Pro.

### Primary
- **Station Violet Fill** (`violet-fill`): the filled-button colour on marketing pages. It is Station Violet a step deeper so white text on it passes AA (4.9:1 where `violet-full` gives 4.2:1). Only ever a fill behind white text; never a text colour.
- **Station Violet** (`violet-full`): the brand hue for tints. The lit initials tile uses it at 20% fill with a 50% border, the nav sign-up at 15%, the Free pricing card at 6% fill with a 40% border, text selection at 35%, and the daytime AutoDJ slot in the schedule mock at 55%. Marketing surfaces still fill buttons with it (see Do's and Don'ts).
- **Soft Violet** (`violet-muted`): violet as text on dark: ON AIR labels and badges (`--color-on-air`), Free pill text, text links, the check icons on the Free card. Any violet word is Soft Violet.
- **Pale Violet** (`violet`): the second line of the hero H1, the typed name in the sign-off heading, initials on the tile, the caret, the focus ring and every focus-visible outline.
- **Deep Violet** (`violet-subtle`): a shared dark violet surface token.

### Secondary
- **Live Emerald** (`emerald-live`, `emerald-signal`, `emerald-text`): LIVE only, meaning a person is broadcasting. On the homepage: the LIVE pill (emerald-live at 10% fill, 25% border), its dot, the lit preview meter at 60%, and live shows in the schedule mock; on the public player, the LIVE state badge.

### Tertiary
- **Fault Red** (`fault-red`, `fault-text`): something has gone wrong: an error, a clash in the schedule mock, or the confirm step of an irreversible action (tinted, 20% fill). `fault-text` for error copy.
- **Pro Amber** (`amber-pro`, `amber-pro-text`): Pro only. The inline Pro tag on the homepage's Pro heading, the Pro pricing card (4% fill, 30% border), its "In beta" tag and check icons.

### Neutral
- **Studio Black** (`dark`): the page ground everywhere (`--background`), the link well behind the preview's URL (at 60%) and the numeral colour on marker pins.
- **Desk Panel** (`panel`): `--card` and `--color-panel`. The opaque surface for players, the name preview, mocks and the name input.
- **Popover** (`popover`): menus and popovers, a step above the panel.
- **Muted, Secondary and Accent surfaces** (`muted-surface`, `secondary-surface`, `accent-surface`): shadcn's quiet fills for hover states, secondary badges and selected items. They carry a trace of violet so every neutral reads as one material.
- **Hairline** (`hairline`): `--border`, 1px on panels and cards. Inner dividers inside panels drop to 6%, homepage section rules and overview group rules to 7%, outer edges 9–10%.
- **Input Line** (`input-line`): `--input`, the edge of fields and outline buttons (outline buttons fill with it at 30%).
- **Zinc Line** (`border-subtle`): the solid hairline for sheet and menu dividers on the marketing site.
- **Text ladder**: `text-primary` for headings, lit names and values. `text-secondary` for marketing body copy. `text-muted` (`--muted-foreground`) for supporting copy, captions and field labels. `text-faint` for hints, small panel labels and anything off air.
- **Scrollbars** are white at 14% on a transparent track, so native chrome belongs to the room.

### Named Rules

**The One Meaning Rule.** Every hue names a state, a fault or a plan. Emerald is LIVE. Violet is the brand, ON AIR and Free. Red is a fault. Amber is Pro. Grey is OFF AIR. If a new colour carries no meaning, keep the element neutral.

**The Red Means Wrong Rule.** Red is reserved for something wrong: an error, a clash, or the confirm step of an irreversible action. A healthy state is never red, and neither is the button that opens a destructive flow; only its confirm is red. (In the dashboard, red means live: see The dashboard.)

**The Live Is Brightest Rule.** Wherever live and AutoDJ time share a view (the schedule mock), the person on the mic gets the brightest fill (solid emerald-signal). AutoDJ steps down a violet ramp: violet-950 with a 40% violet-400 inset ring, Station Violet at 55%, indigo-300 at 70% and violet-200 at 85%. Live is never drawn as the gap in an AutoDJ day.

**The Fill Is Not Text Rule.** Violet Fill (#7f4ff0) sits only behind white text; violet words use Soft Violet. A violet that is readable as a fill is not readable as text on the dark ground, and the other way round.

## Typography

**Display Font:** Bricolage Grotesque (falls back to Onest, then sans-serif)
**Body Font:** Onest (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo)

**Character:** Bricolage is condensed and heavy at display sizes, with tight negative tracking, so headlines hit like a station ident. Onest's open, high x-height body stays calm and legible beneath it. Mono appears only where the content is a machine string or a clock.

### Hierarchy
- **Display** (700, 2.75rem on phones, then 3.75rem, 4.5rem and 5rem at 640/1024/1280px, line-height 0.95, -0.04em): the hero H1 only ("Open a tab." / "You're on air."), with the second line in Pale Violet. The sign-off heading uses the same weight and tracking one step smaller (1.875rem, then 3rem at md and 3.75rem at lg, line-height 1). When a name has been typed, the name inside it is set in Pale Violet.
- **Headline** (600, 1.875rem, then 2.25rem and 3rem at md/lg, line-height 1.05, -0.03em, max 22ch, balanced): homepage section H2s, including pricing.
- **Title** (Onest 600, 1rem to 1.25rem): card titles (via the display face in shadcn CardTitle), studio note titles and plan names.
- **Body** (Onest 400, 1rem on phones and 1.125rem on desktop for homepage lead paragraphs, line-height 1.625–1.7, 30rem–58ch): all prose.
- **Label** (Onest 500, 11px, uppercase, 0.025em): homepage state pills. 
- **Plan tag** (Onest 600, 10px, uppercase, 0.2em, trailing padding trimmed to offset the tracking): homepage Free and Pro tags and pricing status tags.
- **Mono** (JetBrains Mono 400, 15px for the homepage link, tabular numerals): links, slugs, times and data values.

### Named Rules
**The Mono Means Machine Rule.** JetBrains Mono is only for URLs, slugs, times, durations, keys and data values. Never use it for headings, labels, counts, list numbers or decoration.

**The No Kicker Rule.** Headings carry their own weight. No uppercase eyebrow or kicker sits above a heading. If a section needs a plan marker, the tag sits inline after the heading text, inside the heading.

**The 11px Floor Rule.** No marketing text is smaller than 11px. (The dashboard's floor is 10px, for mono caps labels only.)

## Layout

The marketing content column is 72rem (`max-w-6xl`), with side gutters of 16px on phones and 40px from 768px. Breakpoints are Tailwind's defaults (640 / 768 / 1024 / 1280px).

- **Hero:** a 52/48 split from 768px, built as three grid children. The H1 and one sentence sit top left, the form sits bottom left, and the preview spans both rows on the right (max 480px, or 520px for the signed-in player). On phones the order is copy, preview, then form, so the preview stays in view above the keyboard while the visitor types. The preview's play and level-meter row is hidden below 640px so the form reaches the first screen. Copy is centred on phones and left-aligned from 768px. When signed in, the preview becomes the real official-station player and the form becomes a single "Open dashboard" button.
- **Sections (HomeSection):** each section is a heading followed by content, inside the 72rem column with a 1px top rule at 7% white. There are no boxes and no rails. Full-tone sections are padded 64px on phones, 96px at md and 112px at lg. Quiet-tone sections (used by the Pro section) are padded 56px and 80px, so the scroll has a rhythm.
- **Section interiors:** two-column splits from 1024px. TuneIn is 1:1 (prose, then the real player). Studio is 1.5:1 (the mock, then the numbered notes). Pro is 1:1.1 (prose, then the schedule mock). The gap between columns is 48–56px, and on smaller screens they stack with a 32–40px gap.
- **Pricing:** a centred heading, then a 1.35:1 grid within 64rem. The Free card is larger, with Pro and Custom stacked beside it.
- **Sign-off:** centred within 56rem and opened by a 1px top rule at 10% white.

## Elevation & Depth

Depth comes from tone plus soft neutral drop shadows, all pure black and none coloured. Panels sit one step above the ground (#101018 on #08080d), popovers a half step above that (#13131d), are edged with a white hairline, and cast a long, soft, negatively spread shadow that grounds them without a glow. Nothing is translucent over content. Dialog overlays are 80% black with no blur.

### Shadow Vocabulary
- **Panel drop** (`box-shadow: 0 24px 48px -24px rgba(0,0,0,0.9)`): the name preview, players, product mocks and the Free pricing card.
- **Artwork drop** (`box-shadow: 0 18px 40px -12px rgba(0,0,0,0.7)`): station artwork inside a panel.
- **Button drop** (`box-shadow: 0 8px 18px -8px rgba(0,0,0,0.8)`): filled violet buttons and the play button.

### Named Rules
**The Solid Panel Rule.** Surfaces are opaque with a 1px white hairline. Don't use glass, backdrop blur, gradients, halos or coloured glow shadows on surfaces. Shadows are neutral black and only ground a surface. The one light that glows is an indicator: hot and clipping mic-meter segments glow (6px, their own colour) while the mic is open, the way a meter LED does.

## Shapes

Shapes are softly rounded rectangles, with full pills for anything that labels a state and full circles for pins and play buttons. Radii come from the shared `--radius` of 10px:
- **Homepage buttons, the name input, the link well:** 10px.
- **Initials tiles, Pro and Custom pricing cards:** 14px.
- **Players, the name preview, mocks, the Free card:** 18px.
- **State pills, plan and Pro tags, status tags, marker pins, play buttons:** full.
- **Schedule mock rows:** 4px, with slots at 2px.

Borders are always 1px. No border is thicker on one side than the others. State tints the whole edge of a strip or panel, never a stripe. Off air has no pattern of its own. It is drawn unlit: a 3% white fill with an 8% border on the tile, faint text, and meter bars at 6–7% white.

## Components

### Buttons
Buttons are confident and single: each view has one filled button.
- **Shape:** 10px and at least 48px tall on the homepage.
- **Primary:** Violet Fill with white text. On the homepage, Onest 600 at 1rem, 14px × 32px padding (24px sides beside the name input), button drop shadow; labels are "Create a free station" signed out and "Open dashboard" signed in.
- **Hover / Focus:** buttons brighten 110% and lift 1px. Focus is a 2px Pale Violet outline offset 2px. Pressed buttons sink 1px.
- **Destructive:** red tinted at 20% with red text, never solid. It appears only as the confirm inside a dialog or a danger zone.
- **Nav sign-up (homepage secondary):** violet at 15% with a 50% violet border and white text, 40px tall, visible on phones as well. On hover the fill rises to 25% and the border goes solid.
- **Play:** a circular violet button (44–56px) with the button drop shadow and a filled play icon, disabled at 40–50% opacity when there is nothing to play.
- **Text link:** Soft Violet, underlined on hover; white with a 30% underline on the Custom card.

### Chips
- **State pill (StateBadge):** the homepage and player surfaces' state mark, with a 6px dot. LIVE uses emerald at 10% fill with a 25% border and emerald-text. ON AIR uses violet at 10% fill with a 30% border and violet-muted text. OFF AIR has only a 10% white border and text-faint. An optional detail follows the label after a middle dot ("On air · AutoDJ"). The dot pulses only for a signal that is actually live.
- **Plan tag (PlanBadge, homepage):** a tinted fill with a matching border and text, never solid. Free uses violet at 15% with a 50% border. Pro uses amber at 10% with a 30% border. The tag is a footnote and must never outweigh the heading it annotates.
- **Status tag (pricing cards):** plan-tag type in the card's own tint, with a 6px dot for "Available now" and "In beta" and a neutral 14% border for "By hand".

### Cards / Containers
- **Corner Style:** 18px for product panels, 14px for secondary cards.
- **Background:** Desk Panel (#101018), opaque. Plan cards take their plan's tint instead: violet at 6% for Free, amber at 4% for Pro and neutral white at 3% for Custom. Danger zones take red at 3% with a 30% red edge.
- **Shadow Strategy:** panel drop (see Elevation).
- **Border:** 1px white at 9%, or the tint of whoever is on air (see Control Strip).
- **Internal Padding:** 20px on phones and 28px on desktop on the homepage. Inner dividers are 6% white hairlines.
- **Examples:** every marketing mock is labelled as an example, with "(an example)" in its title or a `text-faint` figure caption. The real station player carries no such label.

### Inputs / Fields
- **Station name input:** Desk Panel fill, 12% white border, 10px radius, 48px tall, 16px sides, white 1rem text, faint placeholder, violet caret. It has a visible Onest 500 0.875rem label above it ("Name your station") and a faint 0.75rem hint below it.
- **Hover / Focus:** the border rises to 20% on hover and turns violet on focus. Keyboard focus adds a 2px Pale Violet outline, offset 2px.

### Navigation
- **Marketing:** a logo on the left and text links on the right (Onest 1rem, white, slight tracking). "Sign in" is muted and hidden on phones, and the nav sign-up button closes the row at every width. On mobile a 44px icon trigger opens a right-hand sheet (280px) on the page ground with 8px-radius items that go white on a 5% white fill on hover, with `border-subtle` dividers above the account actions.

### Station Name Preview (homepage signature)
A player-page preview that lights up as the visitor names it. It is a Desk Panel (max 480px) with a StateBadge and a faint "Player page" label on top. Below that is an initials tile (84px on phones, 112px from 768px) beside the name and a one-line status. Next is a play button and a 24-bar level meter, hidden on phones, and last a link well showing `host/station/slug` in mono.
- **Unlit (no name):** OFF AIR pill, a tile at 3% white with an 8% border holding a faint radio icon, "Your station" in faint text, "Off air until you name it", a grey play disc, meter bars at 7% white held at 18% height, and a faint slug.
- **Lit (first keystroke):** a LIVE pill with a pulsing dot, and a tile at 20% violet with a 50% violet border and Pale Violet initials (two letters, in the display face at 700). The name turns white, the status reads "Live from a browser tab", the play disc turns Station Violet, the meter bars go emerald at 60% and animate, and the slug turns white. Every colour change runs over 500ms.
- **Slug:** previewed client-side to match the server's slug rule. The caption says a number is added if the link is taken.
- **Carry-through:** the name is saved to localStorage (debounced 300ms) as it is typed. The sign-off heading repeats it ("Put {name} on air tonight.", with the name in Pale Violet) and falls back to a generic line on the server render. 

### Initials Tile
The stand-in artwork for a station that has no image yet: 14px radius, violet at 20% with a 50% violet border, and two Pale Violet initials in the display face at 700 with -0.04em tracking. It appears in the name preview and, at 56px, in the studio mock ("NB"), so the mock reads as the visitor's own station later on.

### Marker Pin (studio notes)
A 20px white circle with a dark 11px numeral (semibold). Pins 1–3 sit on the studio mock at the track countdown, the mic and the listener count, and the same pins lead the numbered notes beside it. This pairing is the page's only point list. Future pins should set the numeral in Onest, not mono.

### Schedule Mock (Pro)
A Desk Panel labelled "Schedule (an example)" with an "On air · AutoDJ" pill. It shows seven day rows (28–32px tall, 4% white track, 6% hour ticks at 06/12/18) and hour labels in 11px muted tabular Onest. Slots follow the Live Is Brightest Rule. A slot that runs past midnight is drawn as two segments. A legend with 10px swatches sits below a 5% divider.

### Motion
One curve, `cubic-bezier(0.16, 1, 0.3, 1)` (exponential ease-out), at 200–500ms, and only on a change of state; nothing enters on page load. The name preview's colours change over 500ms. Under reduced motion it holds still. (Dashboard motion is under The dashboard.)

### Retired: Day Ribbon and Clock Rail (not rendered)
These are from "The Broadcast Day" (2026-09-25), which the user rejected because it framed Free as the gaps in a Pro day. Their files remain in `client/components/homepage/broadcastDay/`, and nothing renders them.
- **Day Ribbon:** a 24-hour example day drawn to scale, with LIVE at emerald 75%, ON AIR at violet 60%, and OFF AIR as a 135° hatch. A white "Now HH:MM" marker with a knockout ring swept in over 1400ms, and a segmented "Free + Pro / Free only" toggle re-rendered the AutoDJ hours as hatch.
- **Clock Rail:** a sticky 8.5rem left rail on a 1px hairline, with a 24px mono time, a paired state and plan pill, and a 12px knocked-out dot heading each section.
- **Also retired with them:** the Paired Label Rule (state and plan pills always together), the off-air hatch, the knockout-ring shadow, the segmented toggle and the rail-time mono size. Don't revive them for new surfaces.

## Do's and Don'ts

### Do:
- **Do** use Violet Fill (#7f4ff0) as the only filled-button colour on marketing pages, with one filled button per view.
- **Do** draw station state with StateBadge on public surfaces (the dashboard uses the status band and StatusLamp).
- **Do** announce every state change to screen readers once: `status` for healthy, `alert` for faults.
- **Do** mark Pro with an amber tinted tag wherever a Pro capability is shown.
- **Do** build surfaces as opaque #101018 panels with a 1px white hairline (8–10%) and the neutral panel drop shadow.
- **Do** separate homepage sections, and overview groups, with a 7% hairline rule, not boxes.
- **Do** set URLs, slugs, times, durations, keys and data values in JetBrains Mono with tabular numerals, and nothing else.
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
- **Don't** pulse a live dot for anything that isn't actually live, and don't pulse a fault; faults blink three times and hold.
- **Don't** build new surfaces from the retired Day Ribbon or Clock Rail.

## The dashboard (GoCast Design System)

Everything above is the marketing site, help, blog and public player. `/dashboard` is built on the **GoCast Design System**, the Claude Design project shared with the mobile app, and this chapter describes it as shipped (2026-10-01). Where an earlier section says something different about the dashboard, this chapter wins.

**Where it lives:**
- **Spec:** the prototype artifact, unpacked in `docs/design/dashboard-prototype/`. Every decision taken against it is in `docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md`.
- **Tokens:** `client/app/dashboard.css`, scoped to `.dark:has([data-surface="dashboard"])`. Every token is registered with tailwind-merge in `client/lib/utils.ts`.
- **Components:** `client/components/ds/`, shown in a live gallery at `/dashboard/design-system` (dev only).
- **Lint:** `client/eslint.config.mjs` (`dashboardGuardrails`) enforces the rules below.

`components/ui` is the marketing kit and carries no dashboard overrides.

### Colour
A warm near-black ladder, one off-white for actions, and four state hues. Hierarchy comes from lightness steps, not borders or shadows, so cards are borderless.

- **Ground and surfaces:** ground and inset wells `#0E0D0C` (`bg-background`, `bg-surface-inset`), card `#181614` (`bg-card`), raised `#1D1A17`, control `#221F1C` (fields, segmented controls, tracks), strong `#2A2723`, popover and sheet `#1B1916`.
- **Lines:** off-white at 6% (`border-line`) and 14% (`border-line-strong`, for outline buttons and dashed drop zones).
- **Text:** `#F4F1EC` (never pure white), muted `#A39D94`, faint `#6F6A63`. No cool greys.
- **Primary action:** off-white `#F4F1EC` with dark ink `#0E0D0C`. Violet is not the primary colour here.
- **Live red** `#FF5A4E` (`live`; text `#FF8A80`, tint `#3A1714`, soft `#FFB3AC`, ink `#1A0806`): you are live right now, or your mic is open. There is no separate mic hue.
- **AutoDJ violet** `#9B7BFF` (`on-air`; text `#C9B8FF`, tint `#1E1A2B`): the station is playing itself.
- **Amber** `#FFB547` (`fault` and `pro`; text `#FFD48A`, tint `#33260F`, ink `#1A1206`): silence, faults, warnings, unsaved changes, and Pro. Pro is always a tag and a fault always a message, so the two never collide.
- **Green** `#5FD39A` (`ok`): a check passed, something saved. Never on air.
- **Error red** `#FF8177` (`error`): permanent deletes only, meaning the confirm button of Delete station and Delete account, and the words of a delete row.
- **Off air:** warm grey.
- **Ink on fills:** text on a solid red or amber fill is dark ink (`live-ink`, `fault-ink`), never white.

**The State Colour Rule.**
- Red means live right now (or the mic).
- Violet means AutoDJ.
- Amber means silence, a fault or Pro.
- Green means OK.
- Grey means off air.
- Anything that was live but isn't any more (past shows, show times, the owner's slots on the schedule) is neutral off-white or grey, never red.

**The Status Band.** One strip under the top bar on every page says what the station is doing (`ds/StatusBand`, chosen by `shell/StationBand` from the shared status poll). Its fill is the state:
- **Off:** the plain card.
- **On air (AutoDJ):** violet tint.
- **Live:** red tint with pale-red words.
- **Mic open:** solid red with dark ink.
- **Silence:** solid amber with dark ink.

A `StatusLamp` (a dot and a mono caps word) names the state there, in the sidebar and in the overview hero.

### Type
Bricolage Grotesque for everything, body included. IBM Plex Mono for clocks, counters, codes and status labels. IBM Plex Sans Arabic is the fallback for Arabic station names. Sizes are tokens (`text-*`); titles carry their own weight and tracking.

| Token | Size | Use |
|---|---|---|
| `hero` | 40–56px, 800 | "That's a wrap.", the go-live headline |
| `page` | 32–42px, 800 | every page title (`PageHeader`) |
| `display` | 28–34px, 800 | the overview hero line, the talk pad title |
| `title-lg` / `title` / `title-sm` | 30 / 24 / 22px, 800 | stat values, dialog titles, the station name in Profile |
| `heading` | 18px, 700 | card titles |
| `lead` / `body` / `body-sm` / `caption` | 17 / 15 / 13 / 12px | prose, rows, hints |
| `meter-sm` … `meter-xl` | 18 / 26 / 48 / 64px | numbers read as instruments (clock, listeners) |
| `micro` | 11px | mono figures on axes and chips |

Two more type styles:
- **`eyebrow` and `eyebrow-sm`:** mono caps labels at 11px and 10px, +0.1em, used for STARTED, PEAK AT, RIGHT NOW and the lamp words. In the dashboard an eyebrow labels a value or a panel, never a marketing heading, and 10px is the floor; the marketing No Kicker and 11px Floor rules don't apply here.
- **Wordmark:** "Go" off-white, "Cast" violet, ".fm" faint, Bricolage 700. There is no logo file.

### Shape, space and depth
- **Radii,** largest first:

  | Token | Size | Use |
  |---|---|---|
  | `hero` | 30px | dialogs, the hero card |
  | `card` | 26px | |
  | `panel` | 22px | |
  | `well` | 18px | |
  | `button-xl` | 20px | |
  | `button` | 16px | |
  | `control` | 14px | fields, 40px buttons |
  | `item` | 12px | nav and menu items |
  | `chip` | 10px | |
  | `segment` | 9px | |
  | `tag` | 6px | the PRO tag, checkboxes |
  | `swatch` | 4px | |

  Tailwind's default radius steps are not used.
- **Stroke:** one weight, `border-stroke` (1.5px), for ghost buttons, outline cards, dashed drop zones and a focused field. Hairlines are 1px `border-line`.
- **Shadow:** only floating things (menus, popovers, dialogs) cast one, `shadow-panel`. The page has no shadows.
- **Page:** content is capped at `max-w-page` (1240px) with the `px-gutter` side gutter (18px, or 36px from 640px).
- **Pattern:** the talk pad's speaker grille (`grille` / `grille-live`, a 9px dot grid) is the one patterned surface. Every other background is solid.

### Shell
- **Sidebar** (15.5rem, from 1024px):
  - the wordmark and the station card with its lamp;
  - text-only nav: Overview, Studio, AutoDJ, Schedule, Audience, Your shows, Settings, with PRO tags on the Pro pages for a Free plan;
  - the Free plan card with Request Pro;
  - the account menu.

  Below 1024px it becomes a drawer.
- **Top bar:** the breadcrumb, the station clock in mono on the station's time zone, and Updates.
- **Status band:** under the top bar (see Colour).
- **Phone tab bar:** Station, Studio, AutoDJ, Schedule, More.
- **Pages:** a `PageHeader` (title, a lead line, actions on the right), then cards.

### Components (`components/ds`)
- **Actions and dialogs:**
  - **Button:** variants `primary` (off-white; one per view), `ghost` (1.5px outline), `subtle`, `quiet`, `live`, `onair`, `onair-soft`, `pro`, `danger`, `danger-quiet` and `ink`. Sizes from 34 to 64px, plus icon sizes. Press is scale(.98).
  - **Dialog:** a centred card from 640px, a bottom sheet on phones. Footer buttons share the row.
  - **ConfirmDialog / useConfirm:** cancel always reads "Keep …". The confirm is off-white for ordinary confirms (end show, remove tracks). `tone="danger"` gives error red plus a typed confirmation (the slug, or the account email) for permanent deletes, with the consequences listed.
- **Surfaces:**
  - **Card:** tones card, raised, inset, outline, onair, live, warn and pro, with `CardHeader` and `CardLink`.
  - **Stat / StatTile:** a value with its label; `good` turns it green.
  - **Progress:** `SegmentBar` and `ProgressBar`.
  - **List:** `ListRow` and `ActionRow`.
  - **Notice:** a sentence with an action, tinted by state.
  - **PageHeader.**
- **Inputs:**
  - **Field:** `TextField` and `TextAreaField` (label inside a filled box), `PasswordField` (with Show and Hide) and a bare `Input`.
  - **Segmented, Switch / SwitchRow, Select, DayToggle:** DayToggle is violet for AutoDJ slots and neutral off-white for show times; `stretch` gives seven equal columns.
  - **ChoiceCards.**
  - **CopyField:** a value in a well with Copy.
- **Status, disclosure and menus:**
  - **StatusLamp / StatusBand:** see Colour.
  - **Tag / ProTag.**
  - **Disclosure:** a row or a whole card that opens. A nested one keeps its own chevron.
  - **Menu:** dropdown and popover.
- **Built from these elsewhere:**
  - the shell (`components/dashboard/shell`);
  - the overview cards (`components/dashboard/overview`);
  - go-live (`components/dashboard/golive`);
  - the station form and the artwork drop zone (`components/dashboard/station-form`);
  - the studio (`components/studio`): Now playing with talk-up cues at 20s and 10s, the push-to-talk pad, the dBFS mic meter, the running order, and End show leading to the "That's a wrap." screen.

### Rules
- **Tokens only.** The lint fails the build otherwise:
  - no arbitrary values for type, colour, radius, tracking, line height, shadow, ring or stroke;
  - no `[Npx]` sizes;
  - no default palette colours or radius steps;
  - no `components/ui` imports, except skeleton, sidebar, slider, scroll-area and avatar.

  Layout brackets (grid templates, `65ch`, `50vh`, safe-area calc) are fine. If no token fits, add one to `dashboard.css` and to `lib/utils.ts`.
- **No HTML entities in JSX text.** Write ’ — “ ” …: an entity after an `{expression}` drops the space before it.
- **One filled button per view,** in off-white. A destructive flow opens from a neutral or `danger-quiet` button, and only its final confirm is coloured.
- **Phones:** dialogs become bottom sheets. Touch targets are 44px or more in the studio. Nothing scrolls sideways at 390px (the visual suite checks this).
- **Voice:** a calm studio engineer, in the second person and sentence case. UPPERCASE only in mono status labels. Say the consequence, not the state. No emoji.
- **Motion:** state changes only, 150–500ms. The wrap screen rises in. Talk-up cues pulse. Reduced motion holds everything still.
- **Checking a change:** `npm test` runs Vitest, `npm run test:visual` runs every page and state at desktop and phone width, and `npx eslint .` runs the lint.
