# Notifications — design notes

Status: **investigation only, nothing built.** Written 2026-09-11.
Nothing in this document has been implemented. File references were verified
against the working tree on that date.

There are two separate features here that get called "notifications". They
share almost no code and have very different costs. Keep them apart.

| | Audience | Delivery | Effort |
|---|---|---|---|
| **Part 1 — Push** | Anonymous listeners | OS-level, tab closed | 1–2 days |
| **Part 2 — In-app bell** | Broadcasters (logged in) | Dashboard UI | ~1 day |

---

## Current state

All ten notifications in `api/app/Notifications/` are `via() => ['mail']`,
delivered through Resend. No other channel is used anywhere.

Two pieces of infrastructure already exist and are **unused**:

- `api/database/migrations/2026_04_18_154524_create_notifications_table.php` —
  Laravel's standard `notifications` table (uuid, type, morphs, data, read_at).
  Already migrated. Nothing writes to it.
- `User` already has the `Notifiable` trait (`api/app/Models/User.php:39`).

Missing: there is **no service worker** anywhere in `client/`.
`client/app/manifest.ts` exists (PWA manifest for add-to-home-screen and OS
media controls) but a manifest alone cannot receive push.

The listener opt-in that exists today:

- `api/app/Models/StationNotifySubscription.php` — anonymous
  "notify me when this goes live", keyed by email, `unique(station_id, email)`.
- `api/app/Jobs/SendStationLiveNotifications.php:47` — fans out after a delay,
  re-checking the stream session is still open first.

That delay-then-recheck guard is the part most people get wrong, and it is
already built. Reuse it; do not write a second debounce.

---

# Part 1 — Push notifications for listeners

## Web Push vs Firebase

The important correction: **FCM web *is* web push.** Firebase's JS SDK calls
the same `ServiceWorkerRegistration.pushManager.subscribe()` with a VAPID key —
the "Web Push certificate" in the Firebase console is literally a VAPID
keypair, and it needs its own `firebase-messaging-sw.js`.

So this is not "battle-tested vendor vs. hand-rolled protocol". It is the same
W3C protocol either way, and `minishlink/web-push` (wrapped by
`laravel-notification-channels/webpush`) is the standard PHP implementation,
not something you'd be inventing.

Firebase solves **none** of the three hard parts:

- iOS still requires the user to install the PWA to home screen.
- You still write and ship a service worker.
- You still prune dead subscriptions — FCM returns `UNREGISTERED` instead of
  HTTP 410. Same work, different error string.

### What Firebase genuinely buys: topics

This is the real argument and it fits the use case well. A listener subscribes
client-side to topic `station_<slug>`, and `SendStationLiveNotifications`
becomes **one** API call instead of a loop over N endpoints. That removes:

- the `push_subscriptions` table and station pivot
- per-endpoint fan-out and chunking on the `database` queue driver
- stale-token pruning (Google handles it for topics)

Roughly: half a day of backend down to a couple of hours.

**Cost of topics:** they are opaque. You cannot query who is subscribed, and
there is no per-recipient delivery tracking. The email path records
`notified_at` per subscription; push via topics loses that, so the two channels
stop being symmetrical. Probably acceptable for anonymous listeners, but it is
a real loss.

Other costs: ~50KB of Firebase SDK on the listener player page, and a service
account credential to manage in prod.

### Decision rule

- **Native iOS/Android app anywhere on the roadmap → use Firebase now.** It is
  the only option spanning web and native; retrofitting later means rewriting
  the whole subscription layer.
- **Web-only for the foreseeable future →** the delta is small. It is
  topics-vs-a-table, not tested-vs-untested. Slight lean toward raw VAPID: it
  keeps Google off the player page and keeps push symmetrical with email. This
  is a preference, not a correctness argument — Firebase here would not be a
  mistake.

Note: a Google Cloud project already exists for OAuth
(`api/config/services.php:42`), and Firebase attaches to an existing GCP
project — so the "new vendor" cost is lower than it first appears.

Providers worth considering only if you want what they actually sell:

| | When it's worth it |
|---|---|
| **OneSignal** | Want a dashboard, segmentation, delivery analytics without building them. Generous free tier. (Sits on FCM anyway.) |
| **Firebase FCM** | Native apps coming, or you want topics. |
| **Pusher Beams / Novu** | Multi-channel orchestration in one API. Overkill here. |

## Three traps specific to this app

**1. iOS requires PWA install.** Safari only delivers web push if the user
added the site to their home screen (iOS 16.4+). For a radio product where most
listeners arrive on a phone via a shared link, that removes most of the push
audience. The manifest makes the app eligible but the install step cannot be
engineered away. **Keep email as the default opt-in; treat push as an upgrade,
never a replacement.**

**2. Keep the service worker out of the audio path.** The app streams HLS and
runs `client/public/encoder-worker.js` and `client/public/pcm-worklet.js`. Ship
a SW with `push` and `notificationclick` handlers and **no `fetch` handler at
all**. The moment a SW intercepts fetch it sits in front of every segment
request and you own a new class of playback bug.

**3. Prune dead endpoints.** Push services return 404/410 for expired
subscriptions, and they expire constantly (browser reinstall, cleared data).
Without deletion on those responses the table grows unbounded and fan-out
slows. Email has no equivalent — this is the ongoing maintenance cost people
forget to budget for.

## Schema note

The existing table cannot be reused. `station_notify_subscriptions` is keyed by
email with `unique(station_id, email)`; a push subscriber is anonymous with no
email at all and is keyed by `endpoint` plus `p256dh`/`auth` keys. Cleanest is
a sibling `push_subscriptions` table plus a station pivot, then loop both in
`SendStationLiveNotifications`. (Moot if you go with FCM topics.)

## Effort

- Backend — table, subscribe/unsubscribe endpoints, webpush channel, VAPID
  keys, prune on 410: **~half a day** (~2h with FCM topics).
- Frontend — `sw.js`, registration, permission flow, `pushManager.subscribe()`,
  wire into the existing "notify me when live" UI: **~half a day.**
- Cross-browser testing (Chrome / Firefox / Safari / iOS PWA): **the rest.**
  This is what actually eats the schedule.

**Total ~1–2 days.** The estimate and the iOS ceiling are properties of web
push itself, not of the provider — they do not move based on the choice above.

UX note: do not request permission on page load. Ask on the "notify me when
live" click, when intent is explicit.

---

# Part 2 — In-app notifications for broadcasters

The bell/notification-centre in the dashboard: "your Pro is approved", "your
daily stats are ready", and so on. This is the cheap one — the table and the
`Notifiable` trait already exist, so for the notifications that exist today
in-app delivery is a one-word change per class (add `'database'` to `via()`,
add `toDatabase()`). No migration, no new infrastructure.

## The decision that matters: who owns presentation

With many types, this determines whether "dynamic" is real.

**Option A — frontend switches on `type`.** Backend stores raw data
(`{station_id, listener_count}`), client has a component per type. Full design
control, but every new type needs a client deploy. Backend and frontend ship in
lockstep forever.

**Option B — payload carries its own presentation.** Every `toDatabase()`
returns the same contract:

```php
return [
    'title'    => 'Pro access approved',
    'body'     => 'Your account is now on Pro. Listener cap is 500.',
    'icon'     => 'sparkles',
    'url'      => '/dashboard/billing',
    'category' => 'billing',
];
```

One client renderer handles anything. New type = new PHP class, ship it, done.

**Take B.** Lockstep releases for a notification bell is a tax paid forever.
Keep a `type` field alongside so the rare notification needing custom UI (a
stats digest with a sparkline) can be special-cased — one escape hatch,
generic default.

## Preferences: categorise, don't enumerate

Per-user mute is required or the bell becomes noise and people stop looking at
it. But do **not** build a toggle per type — that settings page grows forever
and every new type needs a migration.

Add a `notification_prefs` JSON column on `users`, keyed by **category**:
`account`, `billing`, `station_health`, `digests`. Each notification declares
its category and `via()` checks it:

```php
public function via(object $notifiable): array
{
    return $notifiable->wants('billing') ? ['mail', 'database'] : ['database'];
}
```

Four toggles in settings; adding a twentieth type needs zero UI change. That is
what makes it genuinely dynamic.

## Trap: do not pipe `station_events` into the bell

`api/app/Models/StationEvent.php` says it in its own docblock: *"A station
stuck in an Icecast reconnect loop writes an event every few seconds."* That
table is machine telemetry — pruned by `stations:prune-events`, explicitly not
load-bearing.

The bell is the opposite: user-facing, durable, low-volume. Wiring the timeline
into it means a flapping container buries every real message under 400 rows.

Promote **selected** events only, and debounce them the same way
`SendStationLiveNotifications` already debounces the live check: "your station
dropped offline" fires once after N minutes of confirmed-down, not on every
`live_disconnected`.

## Catalog — what's shippable from existing data

| Notification | Source | Work |
|---|---|---|
| Pro approved | `ProAccessGranted` | add `'database'` |
| Plan expired | `PlanExpired` | add `'database'` |
| Invite redeemed | `InviteRedeemed` | add `'database'` |
| Welcome | `WelcomeNotification` | add `'database'` |
| Email / password changed | existing classes | add `'database'` |
| Inactivity nudge | `InactiveBroadcasterNudge` | add `'database'` |
| Daily stats digest | `ListenerStatHourly`, `ListenerGeoDaily` | new scheduled command |
| Station dropped offline | `StationEvent` + debounce | new, needs guard above |
| Upcoming scheduled show | `StationSchedule` | new, once schedules land |

## Effort

- Backend — `toDatabase()` on the existing classes, prefs column, index and
  mark-read endpoints: **~3 hours.**
- Frontend — bell, dropdown, unread badge, polling: **~half a day.**
- Each new type after that: **~20 minutes.**

---

## Cross-cutting: delivery overlap

Once a single event can go email + in-app + push, the same thing is sent three
ways. Decide per category which channels are default rather than defaulting
everything to all three:

- **Security** (password/email changed) → email always
- **Digests** (daily stats) → in-app only
- **Live alerts** (station went live) → push
- **Billing** (plan expired, Pro approved) → email + in-app

## Open decisions

1. Native mobile app on the roadmap? → decides Firebase vs raw VAPID (Part 1).
2. Accept losing per-recipient delivery tracking for push, if using FCM topics?
3. Confirm Option B (payload carries presentation) for the bell.
4. Category list for `notification_prefs` — the four above, or different?
