# PR #4 "new design": manual test checklist

Branch `feat/dashboard-design`, with main merged in (`dcdc09c`, 2026-10-15). Not pushed.
Already green before this list: `tsc`, lint, 132 client unit tests, `next build`, 166 API tests.

This list is for the things only a human can check: how pages look, how flows feel, real devices, real audio.
When every box is ticked, or has a written reason why not, the branch is ready to merge and deploy.

---

## 0. How to work through this

### Order

Go in this order. Each part builds on the one before.

1. **§1, the merge checks.** About 30 minutes. If any of these fail, stop and fix before going on.
2. **§2–§16, page by page.** Do each page on desktop first, then run the visual sweep in §17 for that page across every width before moving on. Don't do all desktops and then all phones: you'll lose track.
3. **§18, the devices.** Do these at the end, on real phones.
4. **§19, deploy, and §20, the suspected bugs.**

### Accounts (seeded locally 2026-10-15)

Every account's password is **`Password123!`**.

| Account | What's in it |
|---|---|
| **pro@gocast.test** | Pro. **Night Shift Radio**, Europe/London, artwork, description, 3 links. 70 tracks: 24 real songs (some with no artist tag, some with Arabic titles, a 1-hour techno set) and 46 generated ones (one with a very long title, two with no artist). One track is in no playlist. Playlists: Main rotation (default), Morning Jazz, Lofi Afternoon (shuffle), Big Rotation (58 tracks, shuffle), One Track Wonder (1), Empty Shelf (0). 5 jingles, set to play every 3 tracks. AutoDJ slots: Breakfast Mon–Fri 06–10, Drivetime Mon–Fri 16–19 (on time), Sat 22:00–02:00 overnight, Sun 12–14 on the empty playlist, and one covering today at seeding time. 3 show times. 26 past shows (one over 3h, one under 1 min, two from DJ software, older ones with no peak time). About 1,500 listener sessions over 90 days. |
| **free@gocast.test** | Free. **Kitchen Table FM**, America/New_York, 1 show time, 3 past shows, a little listener history, no tracks. |
| **downgrade@gocast.test** | Free, but it used to be Pro. **Former Pro Station** still has 8 tracks, 1 playlist and 1 slot. Its listeners are all more than 30 days ago. |
| **invite@gocast.test** | Pro until 3 Nov 2026 (an invite with an end date). The station has a 100-character name with no spaces, a long genre, no artwork, no description, no timezone, 8 links, and no tracks or shows. |
| **new@gocast.test** | Verified, no station. Use it for the create-station page. |
| **unverified@gocast.test** | Email not verified. The code is **123456**. |
| **admin@gocast.test** | Admin panel `/admin`. Password **`AdminPassword123!`**. |

Not seeded: a Google-only account (sign up with Google yourself to get one), and a file over 300 MB plus a 40-file folder for the upload tests (make them with ffmpeg, or use `~/Downloads/West Coast Talk Radio.mp3`, which is 214 MB).

### Edge-case data to seed

- A 100-character station name with no spaces.
- A 120+ character track title and artist.
- A track with no artist.
- A track in no playlist.
- Two playlists with the same name.
- A station with no timezone.
- A station with 8 links.
- An Arabic station or track name.
- A show history with 0, 1, 6+ and 20+ shows (more than one page). Include one external-encoder show and one show longer than 3h.
- Audience data in four shapes: player-page listens in the last 7 days; stream-only listening; listeners only >30 days ago; nobody ever.
- Files to upload: mp3, m4a, flac, wav, ogg, aac, a .jpg, a file over 300 MB, and a folder of 40 files.

### Devices and widths

| Name | Width | How |
|---|---|---|
| Phone | 390 | Real phone + DevTools "iPhone 12/13" |
| Small phone | 360 | DevTools (Android) |
| Tablet portrait | 768 | DevTools / real tablet |
| Tablet landscape | 1024 | DevTools / real tablet |
| Laptop | 1280 | Browser window |
| Desktop | 1440 / 1920 | Full screen |

These widths are where the layout changes, so they're the ones worth checking:
- **640**: the phone tab bar appears below it.
- **768**: the Schedule grid becomes the day list, and Your shows hides a column, below it.
- **1024**: the sidebar becomes a drawer below it.
- **1280**: station settings goes to 2 columns at and above it, and so does go-live.

Drag the window slowly across each of these widths at least once.

### Writing down failures

When something fails, write it under the item:

> `- [ ] ... ` → **FAIL** (Pro, 390, Chrome Android): what you saw. Screenshot name.

The screenshot test (`npm run test:visual`) gives you desktop and phone shots of most dashboard pages in `client/tests/e2e/.visual/`. Use it as a first pass. It doesn't cover the homepage, auth pages, studio, wrap page or tablet widths.

---

## 1. The merge with main: test first

### 1a. The empty-drop fix (main's `9d55b59`, merged into the PR's rewritten `broadcast.ts`)

You need the dev stack with real Liquidsoap and a Pro station.

- [ ] **Hidden tab (desktop Chrome).**
  1. Go live with music playing.
  2. Switch to another tab for 2+ minutes.
  3. Come back.

  Expected: the band shows **LIVE**. If the browser paused the audio, the band shows **AUDIO PAUSED**: "Your browser paused the studio's audio, so nothing is reaching listeners. Click anywhere or press any key to resume and reconnect." One click should bring it back to **LIVE**.
- [ ] **Locked phone (Android Chrome, then iOS Safari).**
  1. Go live.
  2. Lock the screen for 1+ minute.
  3. Unlock.

  It ends one of three ways:
  - **LIVE**.
  - **RECONNECTING**, then **LIVE**.
  - **AUDIO PAUSED** ("…Tap anywhere to resume and reconnect"). One tap should go to **LIVE**.

  It must **not** keep reconnecting in a loop, and it must **not** end the show on its own.
- [ ] While the band says AUDIO PAUSED, wait **3+ minutes** before tapping. The show should still come back after the tap. A paused drop has no 2-minute give-up.
- [ ] Press **End show** while AUDIO PAUSED. The show ends cleanly and the wrap page appears.
- [ ] Open a second browser on `/station/{slug}`. It should hear the show again after the reconnect, not old audio.
- [ ] In admin, open `/admin/stations/{id}` and filter on `studio_drop`. The drop shows `audio_state` "suspended" or "interrupted" and outcome `reconnected`, or `stopped` if you pressed End.

### 1b. The paid-Pro wording (main's `0b871c5`)

Do these as the **Free** account.

- [ ] Search every page you visit for the words "beta", "free while", "$15", "Request Pro" and "Request access". There should be none.
- [ ] Each of these says **Get Pro**:
  - sidebar plan card
  - Account plan card
  - Library upsell
  - Audience upsell
  - Schedule (locked)
  - Settings → "Use your own DJ software"
  - the Embed option in the Share dialog (it opens Get Pro)
- [ ] The Get Pro dialog:
  - Title "Get Pro".
  - Text "Tell us about your station and we'll email you how to pay. Pro switches on as soon as your payment arrives."
  - Button "Send".
  - After sending: "Thanks — we've got it. We'll be in touch by email with how to pay."
  - Afterwards, every Get Pro button shows its requested state.
- [ ] The request shows up in `/admin/requests`.
- [ ] Homepage pricing:
  - The Pro card says **$20 / month**.
  - It has no "In beta" tag, and its top row still lines up with the Free and Custom cards.
  - Text: "Ask for it from your dashboard once your station is set up, and we'll email you how to pay."
  - Footer: "Pricing last updated 14 October 2026".
- [ ] Library and Audience upsells show $20 and "We'll email you how to pay…".

---

## 2. Dashboard shell (every dashboard page)

### Auth gate and titles
- [ ] `/dashboard` signed out → you land on `/auth/login`. An unverified session also lands on `/auth/login`.
- [ ] Tab titles:
  - Overview: "Overview — GoCast"
  - Account: "Account — GoCast"
  - Station settings: "Station settings — GoCast"
  - Your shows: "Your shows — GoCast"
  - Go live: "Go live"
  - While live: "● LIVE · {Station} | GoCast"
- [ ] Block `GET /user` in DevTools. The dashboard still loads, with no Free plan card, no Pro tags and no Account plan card. It must never show an upsell to a paying user.

### Top bar
- [ ] The hamburger ("Toggle sidebar") and Cmd/Ctrl+B both toggle the sidebar. The collapsed state survives a reload.
- [ ] Breadcrumb:
  - Overview: just the station name.
  - Sub-pages: "{Station} › Page", and the station name links to the overview.
  - Account: "{Station} › Account".
  - New account: empty on `/dashboard`, and "Account" with no › on Account.
  - A long station name gets cut with "…" and doesn't push "Updates" off screen.
- [ ] Station clock (640+ only), e.g. "WED 21:05 · LONDON":
  - It's in the station's timezone, and underscores show as spaces ("BUENOS AIRES").
  - It ticks over each minute.
  - It's hidden when the station has no timezone.
- [ ] Setup chip:
  - Desktop shows a ring and "X of Y set up". Phone shows "X/Y".
  - It's hidden when everything is done, for a New account, and if its request fails.
- [ ] Setup panel:
  - It's a popover on desktop and a bottom sheet on phone.
  - Items:
    - "Add station artwork"
    - "Write a description"
    - "Fill AutoDJ's playlist" (Pro only)
    - "Set your show times"
    - "Add your social links"
    - "Get your first listener" (not clickable)
  - Clicking artwork or description opens Edit station. Show times goes to `settings#show-times` and the heading isn't hidden under the sticky header. Links goes to `settings#links`.
  - The count goes down after you finish an item.
- [ ] Updates (bell):
  - Badge count, with "99+" above the cap.
  - Skeleton rows while loading.
  - Empty: "You're all caught up".
  - Error: "Couldn't load notifications." with "Try again".
  - "Mark all read" clears the badge.
  - "Load older" pages through older ones.
- [ ] Clicking an update:
  - An internal link marks it read and navigates.
  - An external link opens a new tab.
  - An "expand" one opens a dialog with its points.
  - An unknown icon shows a bell.
  - On desktop, hovering shows an X that dismisses it.

### Status band (under the top bar, every page)

Get each state on screen at least once. Check the colour, label, sentence and button.

- [ ] CHECKING → "Checking your station…"
- [ ] OFF AIR, Pro → "Start AutoDJ" button. OFF AIR, Free → "Go live" button.
- [ ] STARTING → "Your station is starting up."
- [ ] ON AIR · AUTODJ (violet) → "AutoDJ is playing {title} by {artist}." with a "Go live" button.
- [ ] SILENCE (amber) → "AutoDJ is on but has nothing to play." with "Add tracks".
- [ ] NOT HEARD (amber) → "Your station is running, but listeners can't hear it right now."
- [ ] NO ANSWER → "We can't reach your station…" / "Your station isn't answering…"
- [ ] GOING LIVE → "Your station is on and waiting for you…"
- [ ] LIVE from DJ software / from the GoCast app / from another browser, each with its own sentence.
- [ ] SHOW ENDED → "Your show has ended. Checking what's on air now…"
- [ ] Live from this tab on a non-studio page:
  - track title, show clock, "N LISTENING"
  - Play/Pause and Next, disabled when the queue is empty
  - "Open studio"
- [ ] On the studio page itself, the band shows none of those controls.
- [ ] LIVE · MIC shows as a solid red band. "Close mic" appears only when the mic is kept open.
- [ ] Phone: a long band message wraps, and pages that jump to an anchor (#show-times, #links) still land below the band.

### Sidebar (fixed at 1024+, a drawer below)
- [ ] The order is:
  - Overview
  - Studio
  - AutoDJ (heading), with Library, Playlists and Schedule under it
  - Audience
  - Your shows
  - Settings
- [ ] The AutoDJ heading opens Library and is bold when any of its three pages is open.
- [ ] Free: a Pro tag on AutoDJ and Audience, and those links still work. Pro: no tags, and a violet "On" lamp on AutoDJ while AutoDJ is on air.
- [ ] The Studio item:
  - pulses "Live" while you're broadcasting
  - goes to `/live` when idle and to `/studio` while broadcasting
- [ ] New account: every nav item shows the toast "Create your station first. Everything here belongs to it." and doesn't navigate. Many clicks still give only one toast.
- [ ] Free plan card:
  - "{Plan} plan", "Get Pro", "Your station goes silent when you stop broadcasting."
  - After a request: "✓ Requested" and "Request sent — we'll be in touch by email."
- [ ] Account row: the avatar or initials, name and email cut with "…" when long, and a Pro tag on paid plans.
- [ ] The account menu opens upwards with "Account and plan", "Help" (new tab) and "Sign out".
- [ ] Sign out while idle → "Signing out…", the toast "Signed out", and you land on `/`.
- [ ] Sign out while live → the dialog "Sign out and end your broadcast?" with "Stay signed in" and "End and sign out". **Then open the player page in another browser: is the show really off?** (see §20).
- [ ] On phone and tablet, the drawer closes after you tap a link.

### Phone tab bar (below 640, needs a station)
- [ ] Tabs: Station, Studio, AutoDJ, Audience, More. The active tab has a bar above it.
- [ ] AutoDJ stays highlighted on Library, Playlists and Schedule. Studio has a red dot while live. More is highlighted on Settings, Your shows and Account, and opens the drawer.
- [ ] The bottom of every page scrolls clear of the tab bar, and nothing is hidden behind it.
- [ ] A New account has no tab bar.

### Get Pro dialog
- [ ] It shows "Requesting as {email}".
- [ ] The link field is required. "@handle" with no dot shows "Please paste a full link to a public page so we can find you."
- [ ] Error messages (force them in DevTools):
  - 401 → "Your session has expired…"
  - 429 → "Too many attempts…"
  - 422 → "Please check the details…"
  - anything else → "Something went wrong…"
- [ ] Send it, press **Close**, then open Get Pro from a different button. It should show the form again, not "Thanks" (suspected bug, §20).
- [ ] New account with no station: Get Pro shows the toast "Create your station first, then tell us about it to request Pro." and no dialog.

### Error and not-found pages
- [ ] Make a dashboard page fail to render.
  - When idle: "This page didn't load", with "Try again", "Go to your station" and "Details for support".
  - When live: "Your broadcast is still on air. Only this page failed…", with "Back to the studio". **The show must keep playing.**
- [ ] Someone else's station slug, or a slug that doesn't exist → the "Page not found" screen.
- [ ] Redirects:
  - `/dashboard` (with a station) → the overview
  - `/dashboard/stations` → `/dashboard`
  - `/dashboard/library` → the station's library
  - `/dashboard/station/studio`, `/live`, `/library`, `/audience` and `/settings` → that station page

---

## 3. Create station (`/dashboard`, New account)

- [ ] "Let's set up your station." and "A name is all it takes. Everything else can wait." The name field has the cursor in it.
- [ ] The link preview:
  - It shows "{host}/station/your-link" until you type.
  - The real link appears about 0.4 s after you stop typing.
  - Clearing the name goes back to "your-link".
- [ ] A name that's already taken gets "-2". An emoji-only name gives "station". "slug-preview" gives "slug-preview-2". A very long name gets cut short.
- [ ] Genre chips:
  - Talk, Jazz, Pop, Rock, Hip-hop, Gospel, Country, Lo-fi, Sports, News, and "Something else…".
  - Clicking a chosen chip unchooses it.
  - "Something else…" shows a "Your genre" field.
- [ ] Description: an "N/160" counter, and pasting more than 160 characters cuts it at 160.
- [ ] Artwork:
  - Drag and drop works, and so does the "Choose" button. On phone there is no button: tap the tile.
  - A GIF shows "Artwork has to be a PNG, JPEG or WebP image."
  - Over 5 MB shows "Artwork can be up to 5 MB."
  - "Remove" works.
  - The create button is disabled while the artwork uploads.
- [ ] The button reads "Create station" (disabled), then "Create {Name}", then "Creating…".
- [ ] Success: the toast "{Name} is ready. It's off air for now.", then the overview. The sidebar, band, tab bar and setup chip all appear.
- [ ] Create a second station from another tab → "Each account has one station, and yours already exists."
- [ ] The "What listeners see" preview updates live, a long name wraps, and on md and up it stays in place while you scroll.
- [ ] Scroll to the very bottom on desktop. The note under the button must not be cut off (suspected layout bug, §20).

---

## 4. Station overview

### Header
- [ ] The artwork button says "Add" with no artwork. Either way it opens Edit station.
- [ ] "Since Oct 2026 · Last live 3 days ago".
- [ ] Edit profile:
  - Save is disabled when the name is empty.
  - Saving shows the toast "Station updated".
  - Cancel and reopen shows the old values.
  - The description has no 160 limit here, unlike create (§20).

### The station states

Check the label, title, text and buttons for each.

- [ ] OFF AIR, Pro: "Nothing's playing right now." with "Go live now" and "Start AutoDJ".
- [ ] OFF AIR, Free: "Go live now" only.
- [ ] STARTING: "Your station is starting…" with "Turn station off".
- [ ] ON AIR · AUTODJ:
  - Text "AutoDJ is on {playlist}…".
  - The now-playing box: title · artist, time left, a progress bar and "Next:".
  - "Stop AutoDJ" asks "Stop AutoDJ on {Name}?" ("Keep playing" / "Stop AutoDJ"), then the toast "Station is off air".
- [ ] Just after a show ends: "Your show has ended." / "Handing back to AutoDJ soon…".
- [ ] NO SOUND (amber): the Pro and Free texts differ.
- [ ] NOT REACHING LISTENERS (amber).
- [ ] LIVE from this tab (red): "Listeners hear you about 15–20 seconds late…" with "Open the studio".
- [ ] LIVE from an encoder: "You're live from {client}." with "Hear your stream ↗" and "Turn station off".
  - Turn station off asks "Cut off this broadcast?" ("Leave it on air" / "Cut it off").
  - Then the toast "Broadcast cut off — station is off air".
- [ ] LIVE from another browser: "End the show from the studio in that browser."
- [ ] Status unknown: after 10 s it says "Can't reach the station to check."

### Listening now
- [ ] The number counts up. Off air it shows "—".
- [ ] The sentence changes with the state: off air (Free/Pro), starting, 0 with a peak, 0 with no peak, live with listeners, AutoDJ with listeners.
- [ ] "See your audience →".

### Your link and sharing
- [ ] "Copy" shows "Copied". Paste it: the URL ends with `?utm_source=owner&utm_medium=share`.
- [ ] Block the clipboard: it shows "Copy it yourself" with the URL selected.
- [ ] "Open ↗" opens a new tab.
- [ ] Share dialog:
  - "Copy link", "WhatsApp", "Email" and "X" each work and close the dialog.
  - "More…" appears only on phones (the share sheet).
- [ ] Tune-in code:
  - The QR shows, and "Download PNG" saves `{slug}-qr.png`.
  - **Scan it with a real phone**: it opens the station with `utm_source=qr`.
- [ ] Embed:
  - Free: it has a Pro tag and opens Get Pro.
  - Pro: a live preview and "Copy code".
  - Paste the code into a local HTML file: it plays.

### Coming up and shows links
- [ ] Empty: "Nothing scheduled. Set your show times…". Otherwise up to 3 rows, as "Today/Tomorrow/Sat HH:MM" in the station's timezone.
- [ ] Show rows have a red bar. AutoDJ rows have a violet bar.
- [ ] The header link is "Schedule →" on Pro and "Show times →" on Free.
- [ ] On a tall window (832+ px) "Your live shows" and "Recent shows" are two tiles. On a shorter window they're one line of text.

---

## 5. Go live (`/live`)

### Pre-flight
- [ ] "Ready when you are."
  - If AutoDJ is on air, the text is "AutoDJ hands over when you start…".
  - Otherwise: "Nothing goes out until you press the button."
- [ ] "Mic + music" and "Music only". Choose Music only and reload: it's remembered. Then end a show and come back: is it still remembered? (suspected bug, §20)
- [ ] Music only: no mic card and no mic permission prompt at any point.
- [ ] Mic check:
  - "Check your mic" asks for permission.
  - If permission was already given, the mic opens on its own.
  - The bars move when you speak.
- [ ] With 2+ microphones, a "Microphone" select appears. Your choice is remembered, and the show uses that mic.
- [ ] Block the mic:
  - You get "Mic blocked", with "Try again", "Go live with music only" and "How to allow it ↗".
  - The help link goes to the right browser's help page (Chrome, Firefox or Safari).
- [ ] With no mic: "No microphone found…".
- [ ] Running order:
  - "+ Add files" and drag-drop both work, and track lengths fill in.
  - It shows "N tracks · time" and "X MB of 2 GB".
  - Non-audio files give a toast. Going over 2 GB gives a toast.
  - "Clear" asks for confirmation.
- [ ] End a show halfway through a song, then come back to `/live`.
  - You get "Pick up where you stopped" ({title}, at m:ss) or "Start over".
  - Each one does what it says once you're live.
- [ ] Private window: "This browser won't let GoCast keep files…".
- [ ] Footer:
  - "Go live on {Station}".
  - "Listeners tune in at …" with "Copy".
  - "Not now".
  - "Using DJ software instead?" appears only on a plan that includes it.

### The checks
- [ ] The rows, in order:
  - "Checking your connection"
  - "Bringing your station on air"
  - "Requesting microphone access" (mic mode only)
  - "Setting up audio engine"

  Each goes Waiting → Checking → Done. When they're all done, the page goes straight to the studio.
- [ ] First show ever in this browser: the toast "🎙️ You're live for the first time — share your link!"
- [ ] Slow line: in DevTools set a custom upload speed of about 160 kbps. You get "Slow connection: sending at 96 kbps…", and the studio shows "96 kbps · slow line" in amber.
- [ ] Upload about 110–140 kbps → 64 kbps.
- [ ] Upload under about 90 kbps → refused:
  - "Couldn't go live." and "Not live".
  - "Your connection is too slow to broadcast: it uploads about N kbps, and a show needs at least 96…".
  - "Try again", "Back", and the help link.
- [ ] DevTools offline before pressing Go live → "Couldn't check your connection…".
- [ ] Free station that's off: "Bringing your station on air" takes about 3–5 s, then Done.
- [ ] Mic blocked at the prompt during the checks → "Mic blocked". "Go live with music only" restarts the checks without the mic.
- [ ] **Cancel** during the checks:
  - Free, station was off before → it goes back off (the band goes OFF AIR).
  - Free, station was already on → it stays on.
  - Pro → it stays on.
- [ ] After a failure:
  - "Back" uses the same rule as Cancel.
  - "Try again" runs the checks again.
- [ ] Click Go live twice quickly: only one show starts.
- [ ] Open `/live` while BUTT is live → "{Station} is already live", with "Hear your stream ↗" and "Back to station".
- [ ] Go live in browser A, then open `/live` in browser B → "Someone is live from another browser or computer…".
- [ ] Open the dashboard over plain `http://` on a LAN IP and press Go live → "Broadcasting needs https:// or localhost…".

---

## 6. Studio

### Layout
- [ ] Wide screens show two columns, narrow screens one.
- [ ] The text under the talk pad:
  - Mouse: "Hold the pad or Space to talk. Press L to keep it open."
  - Touch: "Hold the pad to talk."
- [ ] A Music only show:
  - It shows a "Music only" card instead of the pad.
  - There's no Keep mic open and no Mic settings.
  - The shortcuts list has no Space or L.

### Talking
- [ ] Hold the pad:
  - It turns red: "You're on" / "Let go to close the mic".
  - The music dips.
  - Dragging off the pad keeps the mic open until you let go.
  - Right-click and long-press show no menu.
- [ ] Hold **Space**: the mic opens and closes. If a button had focus, Space must not press it.
- [ ] Hold Space and Alt-Tab away, or switch tabs → the mic closes.
- [ ] Space inside a dialog, a toast, or on a running-order grip must **not** open the mic.
- [ ] Tab to the pad and hold Enter: the mic opens.
- [ ] "Keep mic open" or L:
  - The button turns red and reads "Close mic".
  - Letting go of Space doesn't close it.
  - The band on every page shows "Close mic".
- [ ] "Mic check · only you see this" shows the device name and a meter. While you're talking its heading becomes "Going out live".

### Controls
- [ ] Monitor (M) plays the music in your headphones, never your mic. The volume slider only works while it's on.
- [ ] Mic settings:
  - "Music while you talk": Under you / Low / Silent.
  - "Fade": Instant / Smooth / Slow.
  - "Broadcast voice".
  - Changes apply straight away, even while you're talking, and survive into the next show.
- [ ] Shortcuts dialog: Space, L, K, N, P, R, M. Each key works. None work while typing or with Ctrl/Cmd/Alt held.
- [ ] Play a very loud track and talk over it at the same time. On the listener side it shouldn't distort.

### Now playing and running order
- [ ] "Nothing queued" when empty. "Queue loaded / Nothing playing yet. Press play to start." when tracks are loaded but nothing has started.
- [ ] In the last 20 s of a track the countdown turns amber and reads "GET READY", pulsing at 20 s and at 10 s.
- [ ] The "NEXT" pill: "(from the top)", "Holding this track", "Looping this track" and "Add music" each appear in the right situation.
- [ ] Previous, Next and Play/Pause work. Next is disabled with fewer than 2 tracks.
- [ ] Repeat list / Repeat track, and R toggles them.
- [ ] "Clear upcoming" gives the toast "Cleared N upcoming tracks" with Undo. Removing a track gives "Removed …" with Undo. Undo restores the order.
- [ ] Each upcoming row shows its expected air time. The current row says "PLAYING".
- [ ] Drag to reorder:
  - With a mouse.
  - With touch: hold for about 150 ms first.
  - With the keyboard: focus the grip, press Space, then the arrow keys.
- [ ] Adding files to an empty queue starts it playing. An unplayable file is removed with a toast.

### Stats and toasts
- [ ] "On air" clock: it doesn't reset after a reconnect or after visiting another page and coming back.
- [ ] "Listening" shows "—", then a number, then "peak N".
- [ ] "Audio lost" shows "0 s" in green when nothing was lost. It also shows the current bitrate (kbps) and how much has been sent.
- [ ] Open the player page on another device: "First listener tuned in". The toasts at 5 and 10 listeners appear once each.

### The status lamp while live (in the band)
- [ ] Get each of these on screen at least once:
  - LIVE
  - LIVE · MIC (held and kept open)
  - RECONNECTING
  - AUDIO PAUSED (while reconnecting, and while live)
  - NOT SENDING
  - SILENCE (mic closed and nothing playing for 4+ s; shorter gaps must not flash it)
  - DROPPING AUDIO
  - SLOW CONNECTION
- [ ] The SILENCE text tells you what to do. It differs on desktop, touch, another page, and a music-only show.

### Ending the show
- [ ] The "End your show?" text depends on the plan:
  - Free: "…the station goes off air."
  - Pro: "…they hear AutoDJ straight away."
  - Pro with an empty playlist: "…AutoDJ has nothing to play…"
  - All of them: "Your queue is kept for next time."
- [ ] The wrap page:
  - "That's a wrap."
  - The tiles On air, Peak, Tracks and Audio lost.
  - The heading line names who has the station now.
  - "Back to station" and "See all shows".
- [ ] Reload the wrap page: it sends you to the overview.
- [ ] After the show:
  - Free: the band goes SHOW ENDED, then OFF AIR.
  - Pro: ON AIR · AUTODJ.

---

## 7. Broadcast resilience (do on desktop AND on a phone)

- [ ] Turn Wi-Fi off for 10–30 s mid-show, then back on.
  - The band goes SLOW CONNECTION or DROPPING AUDIO, then RECONNECTING, then LIVE on its own.
  - The track keeps playing from where it was.
  - The show clock doesn't reset.
  - Listeners see the right track name again.
- [ ] Turn Wi-Fi off for **more than 2 minutes**. The show gives up. **What does the studio show? A blank page?** (§20)
- [ ] Slow the upload mid-show, at the OS level (DevTools throttling may not affect the connection):
  - The bitrate steps down from 128 to 96 to 64.
  - Restore it, and after about 5 minutes on a good line it steps back up.
  - **Listen on the player while it switches.** You should hear only a tiny gap, with no chipmunk or slow-motion sound and no silence.
- [ ] Hidden tab, more than 1 minute. See §1a.
- [ ] Locked phone, and switching to another app. See §1a.
- [ ] Android Chrome while live: the screen doesn't dim.
- [ ] Firefox Android: go live, switch to another app for about 1 minute, come back. The audio engine should rebuild in place: same song, same second, still on air.
- [ ] Close or reload the tab while live → the browser asks "Leave site?".
- [ ] Visit every other dashboard page while live. The audio keeps going and the band has the controls.
- [ ] Open Help from the account menu while live (it opens a new tab). The show is not affected.
- [ ] While live, click a link that leaves the dashboard in the **same tab** (e.g. the logo, or a marketing link). **Does the audio stop? Does it keep sending with no screen?** (§20)
- [ ] Sign out while live. **Is the show really over for listeners?** (§20)
- [ ] Admin `/admin/stations/{id}`:
  - Filter `studio_drop`: check the outcome after each test above.
  - Filter `uplink_check`: one row per go-live attempt.
  - `live_connected` / `live_disconnected` around each show.

---

## 8. Library

- [ ] The loading skeleton matches the real page. Watch the "Added" / "In playlists" column header change as it loads (§20).
- [ ] Below 1024 there's a "Library · Playlists · Schedule" bar above the title.
- [ ] The header:
  - "Library" with its help link.
  - Pro: "Jingles" and "Add tracks" (its tooltip names the default playlist).
  - A stats line, "N tracks · airtime · X of Y".
- [ ] Empty:
  - Pro: "No tracks yet".
  - Free: "This is where your music lives once Pro is on."
- [ ] 60+ tracks:
  - It shows "Showing 50 of N" and "Show all N".
  - Searching goes back to 50.
  - Check "Recently added" sorting: are the newest tracks at the top? (§20)
- [ ] A track in no playlist has a red footer note and a "Not in a playlist" tag.
- [ ] The storage bar turns red at 95%, and updates after an upload or delete without reloading.
- [ ] Search:
  - It matches the title and the artist, and shows "{n} found".
  - With no matches: "Nothing matches…".
- [ ] Sort by Recently added, Title and Longest.
- [ ] The ⋯ menu: Jingles ("On" when enabled), and "Fix artist tags" when some tracks have no artist.
- [ ] Rows on desktop: checkbox, #, title/artist, playlist chips, length, Edit, Delete.
- [ ] Rows on phone:
  - The chips move under the title.
  - **There's no length shown anywhere** (decide if that's OK).
  - A long title gets cut with "…" and the buttons stay visible.
- [ ] Clicking a row selects it. Edit, Delete and the checkbox don't also select it.
- [ ] Preview:
  - Hover the #, then press play. There's a spinner, then pause.
  - Only one track plays at a time.
  - Leaving the page stops it.
  - **On touch, tap the # to play.**
- [ ] With AutoDJ on air, the playing track is highlighted.
- [ ] Edit a track:
  - Enter saves and Esc cancels.
  - An empty title shows "Title can't be empty."
  - An empty artist shows "Unknown artist".
- [ ] Delete one track: "Delete "{title}"?", then the toast "Track deleted."
- [ ] The selection bar:
  - "N selected", with Add to playlist, Delete and Clear.
  - On phone, Delete and Clear are icon-only and the bar sits above the tab bar.
- [ ] The select-all checkbox:
  - It selects everything matching the search, including rows past 50.
  - The footer says "N selected, including rows below".
- [ ] Bulk delete:
  - The confirm says "Delete N tracks?".
  - The button shows "Deleting…".
  - The toast says "Deleted N tracks.".
  - Storage and playlist counts refresh.
- [ ] Add to playlist:
  - Choose a playlist; it shows "Adding…", then "Added N tracks to {name}."
  - The chips update and there are no duplicates.
- [ ] Free: "Add to playlist" is disabled with a tooltip, and Delete still works.
- [ ] Upload:
  - "Add tracks" shows "Uploading…".
  - The progress shows the file name, %, size, speed and time left, then "Processing N files…".
  - Then the toast "Added N tracks."
- [ ] Upload the 40-file folder: it goes up in batches and the progress keeps counting across them.
- [ ] A file over 300 MB, or going over your storage, shows an error toast. What's already uploaded stays.
- [ ] Only non-audio files → "No audio files in selection." Mixed files: the non-audio ones are skipped without a word.
- [ ] Dragging files over the list shows a dashed outline. Free: the toast "AutoDJ isn't included in your plan yet."
- [ ] Untagged banner: "N tracks have no artist…", with "Fix tags" and "Dismiss".
- [ ] Fix tags dialog:
  - "Save N" → "Saving…" → "Tagged N tracks."
  - If some fail, the message says how many. Then press Save again: does it re-save the ones that already worked? (§20)
- [ ] Free:
  - A Pro tag on the title, and the upsell card at $20 with "Get Pro".
  - "Preview of your library".
  - Tracks can still be edited, deleted and previewed.
- [ ] The upsell's price column is on the right on desktop and below the text on phone.

## 9. Playlists

- [ ] The header has only "Add tracks", and its tooltip names the open playlist. The stats line reads "N playlists · from M tracks".
- [ ] It opens on the default playlist.
- [ ] The list of playlists:
  - On md and up it's a column on the left.
  - On phone it's a row of chips you scroll sideways.
  - Long names get cut with "…".
- [ ] The default playlist has the tag "Plays when nothing's scheduled".
- [ ] The summary line: "plays in order, then loops" or "shuffled, every track once per pass".
- [ ] Switching playlists shows "Loading playlist…" the first time only.
- [ ] Block the request in DevTools: "Couldn't load {name}" with "Retry".
- [ ] Empty states:
  - An empty playlist: "Nothing in {name} yet" with "Add from library".
  - An empty default playlist: it warns about silence.
  - No playlists at all.
- [ ] A playlist with 1 track has no reorder hint.
- [ ] Remove a track: no confirm, and the numbers redo themselves.
- [ ] Drag to reorder with a mouse, with touch, and with the keyboard. It saves.
- [ ] The drag handles disappear when the sort isn't Play order, when you search, or when shuffle is on, and the footer says why.
- [ ] A playlist with 55+ tracks: the handles only appear after "Show all". Does the footer explain that? (§20)
- [ ] Shuffle shows its toast, and turning it off shows "Back to play order…".
- [ ] Make default: the toast, the tag moves, and Delete/Make default disappear from that playlist.
- [ ] Delete playlist: the confirm says how many schedule slots go with it, then the toast "Deleted {name}." and you're back on the default.
- [ ] New playlist:
  - The name has a 60-character limit, and "Create playlist" is disabled while it's empty.
  - A duplicate name shows an error.
  - The new playlist opens selected.
- [ ] Rename. It has no toast; decide if that's OK.
- [ ] Add from library:
  - Search, and "Select all" / "Clear".
  - The button reads "Add N tracks", and the dialog opens fresh each time.
  - "Every track in your library is already in this playlist." when there's nothing left to add.
- [ ] Upload while a non-default playlist is open: the files join **that** playlist.
- [ ] Free:
  - "New playlist" and Shuffle are disabled.
  - **Rename, Make default, Delete, Add from library, Remove and reorder are still enabled. What happens when you use them?** (§20)

## 10. Jingles (Library → Jingles)

- [ ] The "Play jingles" switch. When it's off, the options are dimmed.
- [ ] The presets: 30 min, 1 hr, 3 tracks, 5 tracks.
- [ ] Custom: Time, Tracks or Clock, each with its own list of options.
- [ ] A station saved at a value that isn't a preset opens on Custom.
- [ ] The explanation under the options changes with the mode.
- [ ] Save settings:
  - It's disabled until you change something.
  - The toast says "Jingles on — takes effect after the current track." or "Jingles turned off."
  - Reopen it: the saved values are there.
- [ ] Close without saving and reopen: your changes are gone.
- [ ] Jingles on with none uploaded: the red warning shows.
- [ ] The list:
  - It loads, shows "No jingles yet…" when empty, and "Try again" if loading fails.
  - With 5+ jingles it scrolls inside the dialog.
- [ ] Upload and delete a jingle. The storage figure in the Library header updates.
- [ ] **Listen**: a jingle actually plays at the interval you set.

## 11. Schedule

- [ ] The header:
  - It has a save lamp, the timezone + "Change" (or "No timezone" + "Set timezone"), "+ Add slot" and "Save".
  - The save lamp shows each of: All saved, Unsaved changes, Saving…, the overlap message, the no-timezone message, and the server-error message.
- [ ] Save shows the toast "Schedule saved". Leaving with unsaved changes makes the browser ask "Leave site?".
- [ ] A station with no timezone: adding a slot shows the notice, and Save is disabled.
- [ ] The "Right now" card: in a slot, between slots, station off ("AutoDJ is off right now."), and Free ("Off air unless you're live").
- [ ] "Your next show" names the next show, or says "None planned".
- [ ] The card updates on its own when the current slot ends.

### Week grid (md and up)
- [ ] It runs Monday to Sunday with dates. Today is highlighted with a "now" line. Below about 44rem it scrolls sideways.
- [ ] Click an empty hour: a 1-hour slot appears and its dialog opens.
- [ ] Drag across empty time:
  - A ghost shows the times and snaps to 15 minutes.
  - It can't run into the next slot.
  - A tiny drag counts as a click.
- [ ] Drag a slot's edge:
  - Only that day changes, in 15-minute steps.
  - It stops at the next slot.
  - The dialog doesn't open.
- [ ] Drag a slot's end past midnight: it continues on the next day's row.
- [ ] The overnight Saturday slot continues onto Sunday.
- [ ] Slot labels:
  - Name and times, plus "· on time" for exact-time slots.
  - Slots shorter than 90 minutes show only the name.
  - Overlapping slots have a red outline.
- [ ] Your show times appear as dashed "YOU" marks. Clicking one goes to settings.
- [ ] The legend and the footer note.
- [ ] **On a tablet:** a tap adds a slot and a drag scrolls. Do the slot edges drag with a finger?

### Slot dialog
- [ ] Name, Plays (with " · default" and "N tracks"), and the empty-playlist warning.
- [ ] From/To with the −/+ buttons and typing. "To (next day)" when the slot crosses midnight.
- [ ] Set From and To to the same time. What happens? (§20)
- [ ] "Start exactly on time" changes the explanation text.
- [ ] The "Every" days: ticking copies the slot, unticking removes it, and you can't untick the last one.
- [ ] An overlap shows an alert and disables Save.
- [ ] "Delete slot" / "Delete on all N days". Then "Done".
- [ ] Save and reload: the same slot on several days comes back as one slot, and days you changed on their own stay separate.
- [ ] **Listen**: an exact-time slot starts on time, and a normal slot starts after the song that's playing ends.

### Phone day list (below md)
- [ ] A 7-day strip with dots. It opens on today.
- [ ] For the chosen day, shows come first, then slots. A day with no slots shows an "All day" row with the default playlist.
- [ ] The "NOW" badge is on the right row.
- [ ] "+ Add slot on {Day} …". It's disabled with "{Day} is full." when there's no room.
- [ ] Tapping a row opens the slot dialog.
- [ ] The sticky save bar appears above the tab bar only when there are unsaved changes. Save also shows in the header at the same time (§20).
- [ ] Make edits, then resize between phone and desktop width: nothing is lost.

### No playlists / Free
- [ ] No playlists: "Add slot" is disabled with "Make a playlist in Playlists first.", and there's a note explaining why.
- [ ] Free:
  - A Pro tag, the upsell, and no Save, lamp or Add slot.
  - The YOU marks still show.
  - A downgraded station's old slots are hidden (§20).

## 12. Audience

- [ ] The title:
  - "N people are listening." / "1 person is listening." while live with listeners.
  - Otherwise "Audience".
- [ ] Pro: the 7d/30d/90d links, only up to what the plan allows. Each changes `?days=`.
- [ ] `?days=abc` in the URL is ignored.
- [ ] The empty cases:
  - nobody ever
  - nobody in this window, with "See the last N days"
  - someone on the direct stream right now
- [ ] The four tiles (2×2 on phone, one row at lg):
  - Listening time
  - Daily listeners
  - Peak at once
  - Average listen
- [ ] The chart:
  - "Listening time per day".
  - Hovering a bar shows that day's numbers. **On touch: does tapping show anything?**
  - Days with no listening still show a thin line.
- [ ] The breakdown cards: Countries (with code chips), Devices, Browsers, Where they came from. Check their empty texts and the stream-only text.
- [ ] "How we count listeners" opens and closes.
- [ ] Free:
  - Two tiles, or "no listeners yet".
  - The upsell: a sample chart labelled as a sample, $20, "Get Pro", then "Request sent".
- [ ] Phone: the range links wrap under the title, and the breakdowns go to one column.

## 13. Station settings

- [ ] Two columns at 1280+, one below. The loading skeleton matches.
- [ ] Profile card and "Edit". With no description: "No description yet. Two lines telling listeners what you play."
- [ ] Links:
  - Empty text.
  - Address + optional name. They're stacked on phone and in a row on sm+.
  - Enter submits, then the toast "Link added".
  - A bad address: "…doesn't look like a web address."
  - A duplicate: "That link is already on your player page."
  - Remove: "Link removed".
  - At 8 links the form is replaced by "8 links is the most…".
  - **The links show on the player page.**
- [ ] Show times:
  - Timezone search: spaces match underscores, and you can use it with the keyboard.
  - Tab out of the timezone list: does it close? (§20)
  - Changing the zone shows "Not saved yet…".
  - "Add show time" adds a row with a name, a time and days.
  - "Unsaved changes" shows, and leaving the page asks "Leave site?".
  - Validation messages: no days, no time, no timezone.
  - "Show times saved", after which Coming up and the setup chip update.
- [ ] Where listeners find you:
  - The player page link, the direct stream link and the quality line.
  - **Open the direct stream while on air: it plays.**
- [ ] Use your own DJ software:
  - Free: locked, with "Get Pro".
  - No ingest router on the server: "isn't available on this server yet".
  - Pro: the five values with Copy, and the password with Show/Hide.
  - "Where these go in BUTT, Mixxx and ffmpeg".
- [ ] **The connection watcher with real BUTT:**
  - With the station off: OFF AIR and "Put it on air".
  - Then STARTING, then WAITING (with a moving bar), then CONNECTED: "{client} is connected." The band and the overview switch to live.
  - TAKEN when the browser studio is live.
- [ ] "New key":
  - It asks for confirmation, then shows the toast "New stream key generated".
  - The new key is shown straight away.
  - BUTT with the old key can no longer connect.
- [ ] The four help questions and "Still not connecting?" (opens a new tab).
- [ ] Delete station:
  - "Type {slug} to confirm" (the case and extra spaces don't matter).
  - "Deleting…", then "Station deleted", then the create page.
  - On phone you can swipe the dialog closed.

## 14. Account (`/dashboard/settings`)

- [ ] The plan card:
  - Free: "You're on Free…" with "Get Pro".
  - Pro: an amber card listing what the plan includes.
  - Invite: "Ends {date}, then your account moves to Free."
- [ ] Profile:
  - Save is disabled until you change something.
  - Changing your email asks for your current password. A wrong password shows the error.
  - Changing your name updates the sidebar.
- [ ] Changing your email opens the "Verify your email" dialog.
  - Esc and clicking outside don't close it.
  - The 6th digit submits on its own.
  - "Resend code" works.
  - After verifying, where do you land? (§20)
  - "Use a different account": where do you end up? (§20)
- [ ] Password:
  - "Update password" is disabled until it's 8+ characters.
  - The toast "Password changed".
  - **Another browser where you're signed in is signed out.**
- [ ] Google-only account: "Set a password". After setting one, the card switches to the normal "Password" card.
- [ ] Delete account: type your email, then "Delete forever", then the toast and `/`. **Then try to sign in again with that account.**

## 15. Your shows (`/dashboard/broadcasts`)

- [ ] Empty: "Nothing here yet…" with "Go live". A New account sees "Create your station" (type the URL in, since the nav is blocked).
- [ ] The summary: "N shows · 3h 20m live in total." With 6+ shows, a trend sentence.
- [ ] The rows:
  - Day, times in the station's timezone, where it came from (md+), a duration bar and the peak.
  - On phone they have 3 columns.
- [ ] Expanding a row:
  - Only one row is open at a time.
  - "Peak at": a time, or "—" with "Nobody tuned in" / "Not recorded for older shows".
  - An external-encoder show repeats its client name twice (§20).
- [ ] "Show more" loads more with no duplicates. If it fails: "Couldn't load more shows. Try again."
- [ ] While you're live, the current show isn't listed. The totals match admin.

---

## 16. Public site

### Homepage `/`
- [ ] Navbar:
  - Logged out: "How it works", "Pricing", "Blog", "Help", "Sign in" and "Sign up".
  - Logged in: your first name, with a menu holding "Dashboard" and "Sign out".
  - The anchor links land below the sticky header, both on `/` and when clicked from `/blog`.
  - Phone: "Menu" turns into "Close". The menu closes when you tap a link, press Esc, tap outside it, or resize past md.
- [ ] Hero:
  - Logged out: "Your voice. On air in 60 seconds.", "Create a free station", and the trust line.
  - Logged in: "Welcome back…" with "Open dashboard".
  - On phone the order is text, player, button.
- [ ] Hero player:
  - Nothing plays on its own.
  - Press play: "Connecting…", then audio with a moving meter. Pause stops it.
  - **Test in Chrome, Firefox, Safari (mac) and iOS Safari.**
  - Lock and unlock the phone while it plays.
- [ ] Hero player when it fails:
  - With the official station off air, it says "Off air" and play is disabled.
  - **Block the stream URL in DevTools and press play. Does it get stuck "playing"?** (§20)
- [ ] With "reduce motion" on in your OS, the meter doesn't move.
- [ ] How it works: 3 cards, with their titles lined up across them on desktop.
- [ ] The studio demo:
  - It only runs while it's on screen.
  - Hold the pad: "You're on". Hold Space while the demo is on screen: the page doesn't scroll. Off screen, Space scrolls the page normally.
  - K, N, P, R work.
  - Click a running-order row: that track plays.
  - "Copy link" shows the demo toast.
  - On phone, holding the pad doesn't scroll or select text.
- [ ] The AutoDJ demo:
  - Desktop: the week grid, with the "now" line and the filter chips.
  - Phone: the day strip.
  - The Late Night slot runs into the next day.
- [ ] Saved stations (only when you've played or saved a station before): play one on `/station/x`, come back, and the tiles appear.
- [ ] Pricing (see also §1b):
  - "Talk to us →" opens the Custom form.
  - Validation, "Send request", the success text and the toast.
  - The 4th try within an hour shows "Too many attempts…".
  - The request shows up in admin as plan=custom.
- [ ] The last CTA, logged in and logged out. The footer links and both email addresses.
- [ ] Tab through the whole page with the keyboard. Focus is always visible.

### Marketing pages
- [ ] `/blog`: the list, desktop vs phone layout.
- [ ] Open all 6 blog posts:
  - Back link, date, and "Updated" where it applies.
  - Clicking the hero image zooms it.
  - Tables scroll sideways on phone, and the page itself doesn't.
  - The sidebar stays in place on lg.
- [ ] `/help`: 5 categories, Pro tags on Pro articles, and the "email us" link (§20).
- [ ] **Open all 18 help articles:**
  - The Pro note where it applies, "Read next", and "Still stuck?".
  - The tab title reads "{Article} — GoCast Help". Check it doesn't end up as "— GoCast Help — GoCast".
- [ ] **All 13 help screenshots load and show the NEW design**, with the same buttons and labels the article describes.
- [ ] `/terms` and `/privacy` are readable on the new colours.
- [ ] `/blog/nope` and `/help/nope` → 404. `/discover` and `/roadmap` → redirect to `/`.

### Auth
- [ ] Login:
  - Empty-field errors, then a wrong password.
  - "Welcome back", then the dashboard.
  - An unverified account gets the verify dialog.
  - Already signed in: you're sent on. `?expired=1` shows its toast.
- [ ] An expired session in the middle of using the dashboard → `/auth/login?expired=1`, without a full page reload.
- [ ] Google:
  - A popup opens.
  - Closing it resets the button.
  - A blocked popup shows a toast.
  - Success logs you in.
- [ ] Register:
  - Each field's error message.
  - The Terms checkbox blocks both the email form and Google.
  - An email that already exists offers "Sign in instead".
  - Success opens the verify dialog.
- [ ] Invite links:
  - valid
  - already used
  - expired
  - unknown
  - the check failed

  Then register with a valid invite **by email and by Google**. The account gets the plan.
- [ ] On an invite link, click Google straight away while the invite is still being checked. Is the invite lost? (§20)
- [ ] Forgot password:
  - Send the code, enter it (pasting with spaces works), set a new password, then sign in.
  - Resend works.
  - The 4th try within a minute is refused.
- [ ] `/auth/callback?error=x` shows "Google sign-in failed…".

### Player page and embed (no code changes here, but the shared colours changed)
- [ ] `/station/{slug}` live, on AutoDJ, off air, and with no artwork. **It looks the same as on main.**
- [ ] Embed on a third-party page: it plays, and "open station" carries `utm_source=embed`.
- [ ] The share links carry the right tag:
  - owner: overview, studio, audience, go-live
  - qr
  - listener: the player's own share button

### Global
- [ ] Fonts:
  - Headings use the new display font.
  - Arabic text renders with a proper font.
  - Marketing pages don't load the Plex fonts (DevTools → Network → Font).
- [ ] Toasts sit above the phone tab bar in the dashboard.
- [ ] Chrome → "Translate to English/Spanish" on `/` and in the dashboard, then click around. There should be no crash.
- [ ] OG preview of `/`, a blog post and a help article (paste them into a link-preview tool). `/sitemap.xml` and `/robots.txt` are fine.

---

## 17. Visual sweep: every page at every width

For each page, check these at **390, 768, 1024, 1280 and 1920**:

- [ ] No sideways scroll on the page (rows that are meant to scroll sideways are fine).
- [ ] Nothing is cut off, overlapping, or hidden under the sticky header or the tab bar.
- [ ] Long text (station name, track title, email) is cut with "…" or wraps cleanly.
- [ ] Dialogs fit the screen and scroll when they're tall. On phone the bottom sheets can be swiped closed.
- [ ] Buttons are big enough to tap on phone, and nothing important needs hover.
- [ ] Loading skeleton, empty state and error state all look intended.
- [ ] Tab through with the keyboard: focus is always visible, and Esc closes dialogs.
- [ ] The DevTools console has no red errors. The Network tab has no failing (red) requests.
- [ ] Spacing, alignment and colours are consistent with the rest of the dashboard.

| Page | 390 | 768 | 1024 | 1280 | 1920 |
|---|---|---|---|---|---|
| Homepage | [ ] | [ ] | [ ] | [ ] | [ ] |
| Blog list + 1 post | [ ] | [ ] | [ ] | [ ] | [ ] |
| Help list + 1 article | [ ] | [ ] | [ ] | [ ] | [ ] |
| Terms / Privacy | [ ] | [ ] | [ ] | [ ] | [ ] |
| Login / Register / Forgot | [ ] | [ ] | [ ] | [ ] | [ ] |
| Create station (New) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Overview (Pro, AutoDJ on) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Overview (Free, off air) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Go live, pre-flight | [ ] | [ ] | [ ] | [ ] | [ ] |
| Go live, checks / error | [ ] | [ ] | [ ] | [ ] | [ ] |
| Studio (live, mic) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Studio (music only) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Wrap page | [ ] | [ ] | [ ] | [ ] | [ ] |
| Library (Pro, 60+ tracks) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Library (Free) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Playlists | [ ] | [ ] | [ ] | [ ] | [ ] |
| Jingles dialog | [ ] | [ ] | [ ] | [ ] | [ ] |
| Schedule (Pro) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Schedule (Free) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Audience (Pro, with data) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Audience (Free) | [ ] | [ ] | [ ] | [ ] | [ ] |
| Station settings | [ ] | [ ] | [ ] | [ ] | [ ] |
| Account | [ ] | [ ] | [ ] | [ ] | [ ] |
| Your shows | [ ] | [ ] | [ ] | [ ] | [ ] |
| Share / QR / Embed / Get Pro dialogs | [ ] | [ ] | [ ] | [ ] | [ ] |
| Updates panel + setup panel | [ ] | [ ] | [ ] | [ ] | [ ] |
| Player page `/station/{slug}` | [ ] | [ ] | [ ] | [ ] | [ ] |

---

## 18. Real devices and browsers

Do at least these flows on each: sign in, overview, a full go-live with mic, a 5-minute show, end the show, Library upload, Schedule edit.

| Flow | Chrome desktop | Firefox desktop | Safari mac | Android Chrome | iOS Safari | Tablet |
|---|---|---|---|---|---|---|
| Sign in / register | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Go live with mic, 5 min | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Hidden tab / locked screen (§1a) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Upload tracks | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Schedule: create, edit, save | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Player page plays | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Homepage hero plays | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

Also:

- [ ] Phone over your local network: this needs `allowedDevOrigins`, the API URL and CORS set up.
- [ ] The mobile app against the new API. Its code change is only a comment, so it needs no rebuild.
  - Station screen: the shows list loads.
  - Start and stop the station.
  - Go live from the app.

---

## 19. Deploy

- [ ] **Deploy the API before the client.** The new client calls `/broadcast/uplink-probe` before every browser go-live, and the Your shows page reads `summary`. With the old API, nobody can go live from the browser and Your shows breaks.
- [ ] `php artisan migrate`. This adds the `stream_sessions.peak_at` column.
- [ ] Re-cache the routes and config, and restart PHP-FPM and the queue/schedule workers. There are new routes and a new `slug-preview` rate limiter.
- [ ] In the prod DB, check that no station has the slug `slug-preview`.
- [ ] Cloudflare must not block or challenge the binary upload `POST /api/broadcast/uplink-probe` (96 KB). Check from a real browser after deploy.
- [ ] Purge the Cloudflare cache for `/encoder-worker.js` and `/lame.min.js`, because their URLs have no version in them. Then fetch `/lame.min.js` and check it contains `q.out_samplerate=k`.
- [ ] After deploy, on prod:
  - Go live once from Chrome and once from a phone.
  - Check the `uplink_check` and `studio_drop` events in admin.
  - Check the Your shows totals.
  - Check Clarity, Umami and GA requests fire.
- [ ] Rollback plan written down: which commit to go back to. The `peak_at` column can stay; the old code ignores it.

---

## 20. Suspected bugs to confirm

Code reading flagged these. Confirm each one in the browser, then mark it **real**, **not a bug**, or **won't fix**.
⭐ = I think this could block the merge.
(main) = the same code is on main, so this PR didn't introduce it.

### Broadcasting
- [ ] ⭐ (main) **If a show fails mid-way, the studio goes blank with no message.** This happens when a reconnect gives up after 2 minutes, after too many engine rebuilds, or after 3 empty sockets. The studio page renders nothing when the state is `error`, and only `/live` shows error text. `studio/page.tsx:77`.
- [ ] ⭐ (main) **Signing out while live doesn't stop the broadcast.** The dialog says "signing out cuts off everyone listening", but `useSignOut` never calls `stop()`. Same question for leaving `/dashboard` through an in-app link while live. `hooks/useSignOut.ts`.
- [ ] Ending any show, or pressing Cancel, forgets the "Music only" choice. `BroadcastContext.tsx:237`.
- [ ] "No microphone found" shows the "Mic blocked" notice, which gives permission advice. `live/page.tsx:29`.
- [ ] Any token error (network, 5xx, 429) shows "Not signed in — please sign in and try again". `broadcast.ts:932`.
- [ ] The Previous button works with 1 track, but the P key doesn't. Pressing K with an empty queue still toggles play.
- [ ] On touch, the kept-open pad hint says "Press L…".
- [ ] With "Silent" chosen, the lamp still says "Music dips under you".
- [ ] A mic unplugged mid-show isn't detected and nothing warns you.
- [ ] Leaving `/live` after a failed check leaves a Free station on until the automatic stop (sweep).
- [ ] Drop reports keep the first outcome they receive. A report sent early as "unknown" or "page_closed" hides the real outcome. `StudioDropController.php:91`.
- [ ] Note, not a bug: `/live` goes on air the moment the checks pass, so there's no separate Start button. The 3-minute "stale checks" code can't be reached.

### Dashboard
- [ ] Get Pro dialog: after sending, pressing **Close** and reopening shows "Thanks" instead of the form. `ProRequestDialog.tsx:51`.
- [ ] Email verify, "Use a different account": it signs you out but leaves you on the Account page. `useEmailVerification.ts:125`.
- [ ] After verifying a changed email you land on the overview, not back on Account.
- [ ] Your shows: an external-encoder show shows its client name twice. `ShowsList.tsx:182`.
- [ ] Edit station has no 160-character limit on the description; create does.
- [ ] The create-station page may be cut off at the bottom on desktop (`-mb-26`). `CreateStation.tsx:148`.
- [ ] `/dashboard/station/schedule` and `/playlists` redirect to the overview instead of those pages.
- [ ] Delete account says "for good", but the account is only soft-deleted.
- [ ] The "requested" wording differs between places: "Requested" vs "Request sent".
- [ ] The timezone list doesn't close when you Tab out of it.

### AutoDJ
- [ ] ⭐ (main) **Uploads ignore the files' ID3 title and artist tags.** Confirmed 2026-10-15. `TrackImporter::readTags` reads `$info['comments']`, but getID3 only fills that after `getid3_lib::CopyTagsToComments($info)`, which is never called. So every uploaded track's title is its file name, and its artist is empty unless the file name looks like "Artist - Title". The seeded tracks were retagged by hand, so to see the bug, upload a file that has tags. The fix is a one-line call in `TrackImporter.php` around line 380.
- [ ] "Recently added" may put the newest tracks at the bottom, behind the 50-row limit. `AllTracksView.tsx:17`.
- [ ] Free accounts can still Rename, Make default, Delete and Add from library on playlists. What does the API do with them?
- [ ] A playlist with 50+ tracks: the reorder hint gives the wrong reason.
- [ ] Fix tags after a partial failure saves the already-fixed rows again.
- [ ] The "Add to playlist" dialog with no playlists mentions a "rail on the left" that isn't on the Library page.
- [ ] Two playlists with the same name give a React key warning in the console.
- [ ] A track's length is never shown on phone.
- [ ] The playlist "Added" column is the upload date, not the date the track joined the playlist.
- [ ] Rename and jingle delete have no success toast.
- [ ] Schedule: setting From = To makes a 24-hour slot. The dialog can create overlaps that dragging can't.
- [ ] Schedule (Free): a downgraded station's slots are hidden, and the timezone "Change" link still shows.
- [ ] Schedule (phone): Save and the save lamp show twice.
- [ ] The audience chart may crash when there's no daily data (`AudienceChart.tsx:119`), and hovering doesn't work on touch.
- [ ] The Library upsell's "Request sent" is plain text, but the Audience one is a button.

### Public site
- [ ] ⭐ **The homepage hero player gets stuck "playing" after a stream error**, with a disabled button and no way to retry. `HeroStationPlayer.tsx:157`.
- [ ] Register: Google can be clicked while the invite is still being checked, and the invite is lost.
- [ ] Login's Google button has no Terms checkbox, so a new account can be made through login without accepting the Terms.
- [ ] Logged-in links go to different places: `/dashboard` vs `/dashboard/stations`.
- [ ] The Custom-plan form hint says "what you need from Pro".
- [ ] The help page says support@gocast.fm; everywhere else says hello@gocast.fm.
- [ ] The sitemap dates for /terms and /privacy are older than the pages' own "Last updated".
- [ ] The navbar user menu still uses old colour classes.

---

## Sign-off

- [ ] Every box above is ticked, or has a written reason.
- [ ] Every ⭐ in §20 is fixed, or deliberately accepted.
- [ ] The fixes from this pass have been re-tested on the affected pages and widths.
- [ ] Feature docs updated and re-stamped (`scripts/docs-check.sh`).
- [ ] PR body posted (`docs/PR4-DESCRIPTION-DRAFT.md`), branch pushed, merged, deployed (§19).

**Tested by:** ______ **Date:** ______ **Verdict:** ready to deploy / not yet
