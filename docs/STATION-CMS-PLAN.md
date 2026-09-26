# Station website (CMS) — design and implementation plan

Turns each station's player page into **the station's website**: news posts,
fixed pages, show pages, later a team page and replays, all on the station's
own URL (and on Pro, its own domain).

Status: **plan only, 2026-09-25 — nothing built.** Written after reading
`main` at `3d2c774`. Why this comes first, and the competitive context, is
in [CASTER-FM-GAP-ANALYSIS.md](CASTER-FM-GAP-ANALYSIS.md) §4.

## 1. Why

- **Many small stations have no website.** They run on a Facebook page plus
  a stream link. "Your site is included" is a reason to switch that price
  alone isn't.
- **SEO.** Today a station is one indexable URL. Every post, page and show
  page becomes another, and each one links to the player.
- **Something to visit when the station is off air.** Right now the player
  page is useless while nobody is broadcasting and AutoDJ is off.
- **It's the frame for the other top gaps.** Show pages are where replays
  go, the team page is where DJ accounts show up, and the site home is
  where chat and requests will live. Build the frame once and each later
  feature is a section, not a new surface.

### Non-goals (v1)
- A theme or page builder. There is one designed layout, and stations
  customise it with artwork, colours (the existing `theme_config`) and
  content.
- Listener accounts, comments and likes. Caster has these; they mean
  moderation work for little gain early on.
- Ads on station sites.
- Podcasts. Replays (a later phase) cover the useful part.
- A general page tree. Pages are a flat list.

## 2. What exists today

Each item below was read from the code.

| Piece | Where | Reuse |
|---|---|---|
| Public player page, SSR, 60s revalidate | `client/app/station/[slug]/page.tsx`, `getStation.ts` | Becomes the site's **home** route |
| Show times ("Morning Drive, weekdays 06:00") | `StationSchedule` model, `ScheduleBlock.tsx` | Show pages attach to these (§4.3) |
| Description, artwork, genre, `social_links`, `theme_config` | `stations` columns | Site header and footer, no migration |
| Image upload, 5 MB, jpg/png/webp/gif → `public` disk | `UploadController`, `UploadRequest` | Post covers and inline images (§5.3) |
| Indexable rule (running, or has broadcast or listener history) | `Station::scopeIndexable()` / `isIndexable()` | Gates indexing of **all** CMS pages (§7) |
| Station sitemap, separate from the site sitemap | `client/app/station/sitemap.ts`, `GET /public/sitemap/stations` | Extended with posts, pages and shows |
| Plan feature flags (`embed_enabled`, `analytics_days`, …) | `Plan` model casts | Add `cms_*` flags here (§8) |
| Notify-me email list | `StationNotifySubscription` | **Not** reused for post emails (consent, §10) |

Nothing on the client does rich-text editing today. There is no editor
library in `client/package.json`.

## 3. URL structure

On gocast.fm, as nested routes under the existing player page:

```
/station/{slug}                    home: player, next show, latest posts, socials
/station/{slug}/news               post list, paginated
/station/{slug}/news/{post-slug}   one post
/station/{slug}/shows              all shows
/station/{slug}/shows/{show-slug}  one show (+ replays, later)
/station/{slug}/team               DJs (phase 4, once team accounts exist)
/station/{slug}/{page-slug}        fixed pages: about, contact, …
```

- `{page-slug}` is a catch-all sibling, so page slugs must reject the
  reserved words `news`, `shows`, `team`, `embed`, `listen`, `feed`,
  `rss`, `sitemap`, and anything the player page later claims. Keep the
  list in one place on the API and validate against it.
- The player must keep playing while the listener navigates between
  sections. This is the one hard front-end requirement. The player moves
  into a `layout.tsx` at `/station/[slug]/` so client navigation between
  child routes doesn't remount it and cut the audio.
- On Pro, a **custom domain** (phase 5) maps `radio-example.com/*` onto
  `/station/{slug}/*` by host, so the routes above are the only
  implementation.

## 4. Data model

All IDs are ULIDs, matching `StationSchedule`. Every table has
`station_id` with a cascading FK and is soft-deleted, like stations.

### 4.1 `station_posts`

| column | type | notes |
|---|---|---|
| id | ulid | |
| station_id | ulid FK | |
| author_user_id | FK users, nullable | owner today; DJ accounts later |
| title | string(160) | |
| slug | string(180) | unique per station; generated from title, editable |
| excerpt | string(300), nullable | falls back to the first paragraph |
| cover_url | string, nullable | from the upload endpoint |
| body | json | TipTap/ProseMirror document, **never HTML** (§5) |
| body_text | text | plain-text projection, for excerpt, search and meta description |
| status | enum draft/scheduled/published | |
| published_at | timestamp, nullable | future + `scheduled` = goes live then |
| pinned_at | timestamp, nullable | at most one pinned post shows first |
| hidden_by_admin_at | timestamp, nullable | moderation, §7.3 |
| timestamps, deleted_at | | |

Index `(station_id, status, published_at)`.

**Scheduled posts need no job.** A post is public when `status` is
`scheduled` or `published` and `published_at <= now()`. That's one scope,
`Post::scopeVisible()`, used everywhere. The only side effects of
publishing are revalidation and the sitemap, and both are pull-based.

### 4.2 `station_pages`

The same shape as posts minus `excerpt`, `pinned_at` and `scheduled`,
plus `position` (nav order) and `show_in_nav` (bool). Slugs are validated
against the reserved list in §3.

### 4.3 `station_shows`

| column | type | notes |
|---|---|---|
| id, station_id | | |
| name | string(120) | |
| slug | string(140) | unique per station |
| description | json, nullable | same document format as posts |
| artwork_url | string, nullable | |
| host_name | string, nullable | free text until team accounts exist |
| position | int | |

Plus `station_schedules.show_id` (nullable FK, `nullOnDelete`). A schedule
row with a `show_id` shows the show's name. A row without one keeps its
free-text `label`, as today. No backfill is required; the Schedule UI
offers "make this a show page" per label.

**Naming trap:** don't call anything here `schedule` beyond the existing
table. `schedule` means advertised show times; AutoDJ uses *slots*. See
the AutoDJ scheduling handoff.

### 4.4 Later phases (for shape only)
- `station_members` (phase 4): user ↔ station, a role (`owner`, `dj`,
  `editor`), and a public bio and photo for the team page.
- `station_recordings` (phase 5 / replays): `show_id`, file, duration,
  `aired_at`, `published`.

## 5. Editor and rendering

### 5.1 Editor
TipTap (ProseMirror) in the dashboard. Allowed nodes: paragraph,
headings (h2–h3 only, since h1 is the title), bold, italic, link,
bullet/ordered list, blockquote, image, horizontal rule, and **embed**
(§5.2). No raw HTML node, no tables, no colours.

The same node list is enforced **server-side**. The API validates the JSON
against an allowlist schema and rejects unknown node or mark types, so a
hand-crafted request can't store something the renderer doesn't expect.

### 5.2 Embeds
Allowlisted providers only: YouTube, Instagram, TikTok, X, SoundCloud,
Spotify, Mixcloud, Facebook.

- The editor takes a pasted URL and the API matches it against
  per-provider URL patterns. Only `{provider, id}` is stored, never the
  provider's HTML snippet.
- On the public page, an embed is a **click-to-load facade**: a thumbnail
  and play button, and the provider's iframe or script only after a
  click. This keeps third-party scripts (and their trackers) off first
  paint, and a failing provider can't break the page. It also keeps the
  station page fast. Its audio is the product, and a YouTube iframe
  autoloading next to the player is a bad trade.

### 5.3 Images
Reuse `POST /uploads/{type}` with a new type, `posts` (same 5 MB,
jpg/png/webp/gif). Two changes are needed first:
- **Ownership.** Today uploads aren't tied to a station or user, so orphan
  files pile up and nothing can be cleaned. Record uploads in a table
  (`uploads`: user, station, path, bytes) so storage can be counted per
  station and a nightly job can remove unreferenced files older than 24 h.
- **Resizing.** A 5 MB phone photo as a cover image kills page speed.
  Generate a 1600 px webp on upload (queued job) and store its URL
  alongside the original.

### 5.4 Rendering
A React renderer in `client/` walks the stored JSON and emits elements
node by node. There is **no `dangerouslySetInnerHTML` anywhere**, which
means no HTML sanitiser to keep correct and no stored XSS through post
bodies.

Links get `rel="nofollow ugc noopener"` and `target="_blank"` when
external (§7.2). Watch the JSX whitespace trap when the renderer joins
text nodes and marks. Verify in the rendered HTML, not in the editor.

## 6. API

Owner routes sit under the existing authenticated station prefix and use a
`StationContentPolicy` that checks ownership now and member roles later:

```
GET    /stations/{slug}/posts            ?status=
POST   /stations/{slug}/posts
GET    /stations/{slug}/posts/{id}
PATCH  /stations/{slug}/posts/{id}
DELETE /stations/{slug}/posts/{id}
POST   /stations/{slug}/posts/{id}/pin   (unpins any other)
       … same five for /pages and /shows
PUT    /stations/{slug}/pages/order
PATCH  /stations/{slug}/schedules/{id}   + show_id
POST   /embeds/resolve                   URL → {provider, id, thumbnail} or 422
```

Public routes go in the `throttle:public` group:

```
GET /public/stations/{slug}/posts?page=
GET /public/stations/{slug}/posts/{post-slug}
GET /public/stations/{slug}/pages/{page-slug}
GET /public/stations/{slug}/shows
GET /public/stations/{slug}/shows/{show-slug}
GET /public/stations/{slug}/feed.xml     RSS 2.0, latest 20 posts
GET /public/sitemap/stations             extended, §7.1
```

The existing `GET /public/stations/{slug}` gains `nav` (visible pages in
order) and `latest_posts` (3), so the home route stays a single request.

Public responses go through `Post::scopeVisible()` **and** exclude
`hidden_by_admin_at`. Put both in one scope so no endpoint can forget the
second.

## 7. SEO and abuse

This is the biggest risk in the plan. A free CMS on a domain Google trusts
is exactly what SEO spammers look for: sign up, write 200 posts full of
casino links, never broadcast.

### 7.1 Indexing follows the station
- A CMS page is indexable **only if its station is indexable**, using the
  existing `isIndexable()` rule. A station that has never broadcast and has
  no listener history gets `noindex, follow` on every CMS page, the same as
  the player page today (`page.tsx:46`).
- The station sitemap lists posts, pages and shows **only** for indexable
  stations, with real `lastModified` from `updated_at` (see the comment in
  `client/app/sitemap.ts` on why fake dates hurt).
- Add `Article` JSON-LD on posts and `RadioSeries` on shows; each points
  back to the station's `RadioStation` entity.

### 7.2 Links
Every outbound link in station content gets `rel="nofollow ugc"`. That
removes the SEO reason to spam in the first place.

### 7.3 Moderation
- On `/admin/stations/{id}`, add a posts tab with a **Hide** action that
  sets `hidden_by_admin_at`. Record it on the station timeline
  (`station_events`, as monitoring only; it is not load-bearing).
- Rate limit posts to 20 per station per day on Free. Real stations never
  hit that; scripts do.
- A Telegram alert (the existing `AdminTelegram`) when a station that has
  never broadcast publishes more than 5 posts or any post with more than
  10 external links. Alert only, no automatic action, until real patterns
  show up.

## 8. Free vs Pro

**Proposal, to decide (§10):**

| | Free | Pro |
|---|---|---|
| Posts, pages, show pages | ✓ | ✓ |
| RSS feed | ✓ | ✓ |
| Custom domain | ✗ | ✓ |
| GoCast branding in site footer | shown | removable |
| Scheduled posts | ✗ | ✓ |
| Post rate limit | 20/day | none |
| Team members as authors (phase 4) | owner only | ✓ |

Rationale: the SEO and switching value needs the site available to every
station, including Free, so Free gets the full basic site. Pro sells the
"it's *our* website" features, meaning the domain and removing our
branding. Add `cms_custom_domain` and `cms_remove_branding` booleans to
`plans`, following `embed_enabled`.

## 9. Dashboard UI

- Add **Website** to the station sidebar, with tabs for Posts, Pages and
  Shows, following the pattern in `AutoDjTabs.tsx`.
- **Posts list:** title, status badge, date, pin, a "View" link that opens
  the public URL, and an empty state that explains what posts are for.
- **Post editor:** title, cover, body; a side panel for slug, excerpt,
  status/date and pin; autosave of drafts; a "Preview" that opens the
  public route with a signed preview token.
- **Station checklist** (`StationChecklist.tsx`): add "Write your first
  post" after the existing steps.
- **Help:** a new `/help` article, "Your station website".

## 10. Open decisions

1. **Free vs Pro split** as in §8. The main question is whether scheduled
   posts are Pro-only.
2. **Custom domain mechanics** (phase 5): Caddy on-demand TLS on the
   native host vs Cloudflare for SaaS. Caddy is free and already fits
   `infra/native/`; Cloudflare handles certificates and DDoS but costs
   money per hostname beyond the free allowance.
3. **Emailing followers about new posts.** The notify-me list was given
   for "tell me when this station goes live" and does not cover news.
   Either add a separate opt-in ("also send me news") or leave post
   emails out. Do not repurpose the existing list.
4. **Should the player page's URL become the site home** exactly, or
   should `/station/{slug}` stay "just the player" with the site at
   `/station/{slug}/home`? Recommended: the same URL. It already has the
   links and the index history, and moving it throws that away.

## 11. Phases

Each phase ships on its own.

1. **Posts and site home.** `station_posts`, owner and public API,
   editor, renderer, the nested-routes layout with a persistent player,
   RSS, sitemap and indexing rules, admin Hide, rate limit.
   *Verify:* create → publish → visible on the station page → in the
   sitemap only when indexable → hidden by admin disappears everywhere →
   audio keeps playing while navigating between home and a post.
2. **Pages.** `station_pages`, reserved slugs, nav in the station
   response.
3. **Show pages.** `station_shows`, `station_schedules.show_id`, the
   schedule block linking to show pages.
4. **Team.** `station_members` + roles. This is the DJ-accounts feature
   from the gap analysis, and it fills the team page and post authors.
5. **Custom domain (Pro)** and **replays** on show pages. These are
   independent; do whichever the user demand says first.

## 12. Traps to remember

- The persistent player (§3) is the thing most likely to regress: any route
  that isn't under `app/station/[slug]/layout.tsx` will remount it and cut
  the audio. Test navigation with audio actually playing.
- The player page looks dead under browser automation (hidden tabs pause
  HLS and the listener feed). Verify the persistent-player behaviour in a
  real, focused tab.
- `getStation()` treats only a 404 as "gone"; the new public fetchers must
  keep that distinction (throw on 5xx) or an API blip deindexes posts.
- Revalidation is 60 s on the station fetch. An owner who publishes and
  refreshes may not see the post for up to a minute. Either call
  `revalidateTag` from the API on publish or say "can take a minute" in
  the UI.
- Don't store provider embed HTML, and don't render post HTML. Both are
  the XSS routes this design removes on purpose (§5).
