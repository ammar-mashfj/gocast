---
feature: Free-tier watermark ("powered by GoCast" clips)
verified: 2026-09-29 against ea570df plus uncommitted work
sources:
  - api/app/Services/WatermarkClipLibrary.php
  - api/app/Jobs/ReloadWatermarkClips.php
  - api/app/Http/Controllers/Admin/WatermarkClipController.php
  - api/app/Http/Requests/Admin/StoreWatermarkClipRequest.php
  - api/resources/views/admin/watermark.blade.php
  - api/resources/views/admin/layout.blade.php
  - api/routes/admin.php
  - api/database/migrations/2026_08_18_100000_add_watermark_to_plans_table.php
  - api/config/liquidsoap.php
  - api/resources/views/liquidsoap/station.blade.php
  - api/app/Services/LiquidsoapSupervisor.php
  - api/app/Models/User.php
  - api/app/Models/Plan.php
  - api/app/Observers/UserObserver.php
  - api/app/Http/Resources/StationResource.php
  - api/app/Http/Resources/UserResource.php
  - api/app/Notifications/ProAccessGranted.php
  - infra/native/setup-native.sh
  - client/interfaces/Station.ts
  - client/interfaces/Plan.ts
  - client/app/(marketing)/terms/page.tsx
  - api/config/analytics.php
  - api/resources/views/admin/accounts.blade.php
  - api/app/Providers/AppServiceProvider.php
  - api/app/Http/Controllers/Admin/AccessRequestController.php
  - api/app/Http/Controllers/Admin/StationController.php
  - api/app/Services/InviteRedemption.php
  - api/app/Console/Commands/ExpirePlans.php
  - api/app/Http/Controllers/PublicEmbedController.php
  - api/app/Http/Controllers/StreamKeyController.php
fingerprint: 157d7544d39086c6
---

# Free-tier watermark (voice ID clips)

A short platform-owned audio clip ("powered by GoCast") that Liquidsoap mixes over a station's output every few minutes, ducking the host's audio rather than replacing it. Which stations get it is decided by the **owner's plan** (`plans.watermark_enabled`, true only on the `free` plan); how it sounds is an **install** setting (`config/liquidsoap.php`); what it says is **whatever files are in one shared directory**, managed from the admin panel.

**The one thing people get wrong: it is fully built and wired, but it plays nothing unless clips are in the directory.** With the code defaults the feature is "on" (`LIQUIDSOAP_WATERMARK_ENABLED` defaults to true and the free plan row is flagged), yet an empty clip directory makes the source fail quietly and every station broadcasts unmarked. The dev machine's directory (`/var/gocast/system`) is empty as of this verification. The dashboard therefore does not mention the feature at all (see Surfaces), and the client types say "built, never switched on". Treat it as **dormant, not deleted**: dropping one audio file into the directory (or uploading it in `/admin/watermark`) turns it on for every free-plan station on the next reload.

## What it actually does

### Deciding who is marked

`User::watermarked()` (`api/app/Models/User.php`) is the single source of truth. It returns true only when both hold:

1. `config('liquidsoap.watermark_enabled')` is true (the install-wide kill switch; env `LIQUIDSOAP_WATERMARK_ENABLED`, default `true`);
2. the user's plan has `watermark_enabled = true`.

A user with no resolvable plan is not marked. `LiquidsoapSupervisor::watermarkEnabledFor($station)` is `$station->user?->watermarked() ?? false`, so a station whose owner cannot be resolved is not marked either.

There is **no station column** for it and it is absent from `UpdateStationRequest`, so a user cannot switch it off. The migration `2026_08_18_100000_add_watermark_to_plans_table.php` adds `plans.watermark_enabled` (boolean, default **false**, deliberately, so a new plan does not inherit it) and then sets it to true for the row with slug `free`. There is no seeder entry. Pro and any other plan are false unless someone edits the column by hand. `Plan` is `$guarded = []`, and `watermark_enabled` is in its activity-log field list; there is no admin UI to edit plan flags (nothing in `routes/admin.php` does), so changing it means a DB edit or a new migration.

### Where it sits in the audio graph

`api/resources/views/liquidsoap/station.blade.php`, section "Free-tier watermark" (about lines 974 to 1073). It is built only when the rendered var `$watermarkSupported` is true (`config('liquidsoap.watermark_enabled')`, passed by `LiquidsoapSupervisor` at about line 1195). Otherwise the script has `broadcast_source = listener_source`.

When supported:

- `watermark = playlist(id="watermark", "/data/system", mode="randomize", reload_mode="never", on_fail=...)`. It points at a **directory**, so several clips rotate at random and an **empty directory** just makes the source unavailable (`on_fail` logs at level 2 "station plays unmarked" and returns an empty list). Station start never depends on a clip existing.
- Three interactive variables, initial values rendered from config and plan: `watermark_enabled` (bool), `watermark_interval` (float, seconds), `watermark_duck` (float). Their names are the `VAR_WATERMARK_*` constants in `LiquidsoapSupervisor`.
- `watermark_due()` = `watermark_enabled() and (live.is_ready() or autodj_mix.is_ready())`. So it never plays into the silence bed (an ID alone into an empty stream would read as a fault).
- `watermark_arm = source.available(delay(initial=true, watermark_interval, watermark), watermark_due)`. `delay(initial=true, ...)` means the first clip is **not** immediate: it waits one full interval after the container's start, then plays a clip each interval.
- `broadcast_source = smooth_add(duration=<fade>, p=watermark_duck, normal=listener_source, special=watermark_arm)`. `p` is the fraction of the station audio **kept** during the clip (0.15 = station at 15%, about -16 dB). `duration` is the ramp down and back, in seconds, fixed at render time.
- The peak limiter (`broadcast_out = limit(...)`, when `limiterIncludeLive`) sits **after** the watermark, so the clip plus the station are limited together.
- Both encoders (Icecast and HLS) take `broadcast_out`. `output_source` (what `/status` and the now-playing push read) stays **un-watermarked**, so the clip never appears as a track and never overwrites metadata.

The placement is below the live/AutoDJ fallback on purpose: free plans have `autodj_enabled = false`, so everything a free station broadcasts is a live show, and a mark applied to the AutoDJ arm would be inaudible while one above the fallback would be evaded by going live. In practice the clip is mixed over a person talking. This puts an operator on the live path, which the file otherwise forbids for track-boundary operators; `smooth_add` has no track logic (the template comments claim a 42-second endless-carrier test; that is a claim about a live Liquidsoap run and cannot be checked from the repo).

### Settings and their clamps

| Key (`config/liquidsoap.php`) | Env | Default | Effect |
|---|---|---|---|
| `watermark_enabled` | `LIQUIDSOAP_WATERMARK_ENABLED` | `true` | Kill switch. Off: not rendered into scripts, `User::watermarked()` false everywhere, `ReloadWatermarkClips` returns immediately. |
| `watermark_interval_seconds` | `LIQUIDSOAP_WATERMARK_INTERVAL` | `600` | Seconds between clips. `watermarkInterval()` floors it at **60** before it reaches the script or telnet. |
| `watermark_duck` | `LIQUIDSOAP_WATERMARK_DUCK` | `0.15` | Portion of station audio kept. `watermarkDuck()` clamps it to **0.01 to 1.0**. |
| `watermark_fade_seconds` | `LIQUIDSOAP_WATERMARK_FADE` | `1.0` | Ramp seconds. Not clamped. Render-time only. |
| `watermark_clip_max_bytes` | `LIQUIDSOAP_WATERMARK_CLIP_MAX_BYTES` | `5 * 1024 * 1024` | Upload cap in the admin request. |
| `system_dir` | `LIQUIDSOAP_SYSTEM_DIR` | `/var/gocast/system` | The one shared directory. |

The env values are read only through config, so `config:cache` deployments need a cache rebuild for changes to apply.

### The clip directory

`WatermarkClipLibrary` (`api/app/Services/WatermarkClipLibrary.php`). The directory is the source of truth; there is **no database table** for clips. Anything dropped in over SSH shows up in the admin list.

- `ALLOWED_EXTENSIONS`: `mp3, ogg, oga, opus, flac, wav, m4a, aac`. `all()` lists only files (non-recursive) with those extensions, name-sorted, with size, mtime and a best-effort `getID3` duration (null on any failure).
- `store(UploadedFile)`: `ensureDirectoryExists`, `chmod 0755` on the dir (Liquidsoap runs as UID 100 in the container), extension from the client filename (default `mp3` if none; throws `RuntimeException` if not allowed), name rebuilt as `Str::slug(original stem)` or `clip`, then a unique name (`name.ext`, `name-2.ext`, ...; **never overwrites**), file moved in and `chmod 0644`.
- `delete($filename)`: `basename`, extension whitelist, `realpath` containment inside the directory; returns false if missing, outside, or not allowed.
- `writable()`, `exists()`, `totalBytes()`, `directory()` feed the admin page.

The same directory is mounted read-only into every station container at `/data/system` (`LiquidsoapSupervisor::CONTAINER_SYSTEM_DIR`, `mountFlags()`), **unconditionally** even when the switch is off. `LiquidsoapSupervisor` also runs `File::ensureDirectoryExists($this->systemDir)` before each `docker run` so Docker does not create it as root. `infra/native/setup-native.sh` creates `/var/gocast/system` on a native host.

### Reaching running stations

- **Plan change (live, no restart):** `UserObserver::updated` fires when `plan_id` changed. For each of the user's `running()` stations (`desired_state = running`) it calls `LiquidsoapSupervisor::applyWatermarkSettings()`, which sends three telnet commands `var.set watermark_enabled = true|false`, `watermark_interval = <n.0>`, `watermark_duck = <n.nnn>`. It unsets the stale `plan` relation first and sets `station.user` to the updated user. Failures are logged (`Log::info` "Watermark settings not applied live", first failure aborts the rest, returns false; the observer wraps the call in try/catch with `Log::error`). A stopped station picks up the right values when its script is next rendered. Paths that change `plan_id` on an existing user and so fire it: `AccessRequestController` (approve at line 222, revoke at 287), `Admin\StationController` upgrade (line 297), `InviteRedemption` (invite redeemed by an existing account) and `plans:expire`. Admin account creation (`AccountController`) sets `plan_id` on a brand-new `User`, which fires `created`, not `updated`, and it has no stations yet.
- **Clip added or deleted:** `ReloadWatermarkClips` job (queued, `ShouldQueue`), dispatched by the admin `store` and `destroy` actions. For each `Station::running()` it sends telnet `watermark.reload` (`LIQ_SOURCE = 'watermark'`), catching per-station failures with `Log::info`. It is needed because the playlist is rendered with `reload_mode="never"`. It does nothing when the kill switch is off. Note that `telnet()` returns `''` in test mode and the job ignores the reply, so an "unknown command" answer would go unnoticed.
- A container that is down reads the directory fresh at next boot.

## Endpoints (admin panel only)

All under the `admin` prefix and `auth:admin` guard (`routes/admin.php`, lines 96 to 98). Nothing is exposed on the public or owner API except a read-only flag (below).

| Route | Name | Controller method | Does |
|---|---|---|---|
| `GET /admin/watermark` | `admin.watermark.index` | `index` | Renders `admin/watermark.blade.php` with clips, directory, writable flag, total bytes, config values, and two counts. |
| `POST /admin/watermark` | `admin.watermark.store` | `store` | `StoreWatermarkClipRequest` then `library->store()`, dispatches `ReloadWatermarkClips`, redirects with status "Added {name}. Running stations will pick it up shortly." |
| `DELETE /admin/watermark` | `admin.watermark.destroy` | `destroy` | Validates `name` (required string, max 255), `library->delete()`. Missing: redirect with error "That clip is no longer there." Else dispatch reload and status "Removed {name}...". |

`StoreWatermarkClipRequest` (`authorize()` is always true; the guard is the route middleware): `clip` is `required|file|mimes:<ALLOWED_EXTENSIONS>|max:<watermark_clip_max_bytes/1024>` (KB; 5120 by default). Custom message for `clip.mimes`. The library re-checks the extension, but not the size.

`index` computes `markedStations` (stations whose `user.plan.watermark_enabled` is true; soft-deleted stations are excluded by the model's default scope; this ignores the kill switch) and `markedOnAir` (the same, `->running()`).

## Surfaces

- **Admin panel:** sidebar link "Watermark clips" (`admin/layout.blade.php`), page `admin/watermark.blade.php`. States: warning banner when the install switch is off ("clips are still managed here, but nothing plays them"); warning when the switch is on and no clips exist ("N stations on a watermarked plan are currently broadcasting unmarked"); error when the directory is not writable; clip table (name, length as m:ss or a dash, size, "added" from mtime, Remove with a `confirm()` prompt); upload form with an `accept` list and the size cap; "How it plays" card (feature on/off, interval, duck percent, fade); "Who hears it" card (marked stations, and those on air); "Directory" card. The accounts page (`admin/accounts.blade.php`, line 99) appends ", watermarked" to a plan's summary when its flag is set.
- **API, owner-only read-only flag:** `StationResource` emits `watermarked` only when the requester owns the station (`$request->user()->watermarked()`); `UserResource` emits `plan`-block `watermarked` (line 66). Neither can be written. `PublicEmbedController` and `StreamKeyController` docblocks refer to it being kept off public resources; not otherwise involved.
- **Web dashboard / mobile / player page / help:** **nothing renders it.** `client/interfaces/Station.ts` (`watermarked?: boolean`) and `client/interfaces/Plan.ts` (`watermarked: boolean`) carry comments saying the field is kept only because the API sends it and nothing should render or gate on it. A grep of `client/` and `mobile/` for "watermark", "powered by GoCast" and "voice id" finds only those two interface files and the terms page.
- **Terms of service** (`client/app/(marketing)/terms/page.tsx`, lines 59 to 62): says the licence extends to "mixing a short audible 'powered by GoCast' identifier into free-plan streams, which we do not do today and would announce before starting." That is the only public-facing wording, and it states the feature is off.
- **Email:** `ProAccessGranted` docblock says the watermark is "not a real difference today: no clips are installed", and the email does not mention it.

## Gaps and traps

1. **Effectively dead in practice.** Flags say on (config default true, free plan true), but the clip directory is empty on the dev box, so nothing plays. Production contents are unverified from this repo; the `ProAccessGranted` comment says none are installed. Uploading one clip switches it on for all free stations (each on its next reload), with no further gate, so do not upload a test clip on a production admin panel casually. The terms promise an announcement first.
2. **Copy that would be false if enabled quietly.** The terms page currently says "which we do not do today". If a clip goes live, update that sentence and add the announcement it promises.
3. **Admin page overstates live tuning.** The "How it plays" card says "Stations pick up interval and duck live". In code, `applyWatermarkSettings()` runs only from `UserObserver::updated` (plan change). Editing the env or config does nothing to a running container until it is re-rendered and restarted, or its owner's plan changes. Fade is render-time only (the card is right about that).
4. **Kill switch does not touch running containers.** Turning `LIQUIDSOAP_WATERMARK_ENABLED` off changes rendering and `watermarked()` for new boots and for the next plan-change push, but a container already running keeps its old script; `ReloadWatermarkClips` also stops reloading. Turning it on again needs a re-render, not a container recreate (the directory is always mounted).
5. **Stale wording in the admin card.** "Upgrading is the only way it stops" ignores the install kill switch.
6. **Same directory holds the GeoIP database.** `ANALYTICS_GEOIP_DATABASE` defaults to `/var/gocast/system/GeoLite2-Country.mmdb` (`api/config/analytics.php`, `.env.example`), and `system_dir` is the same folder. The admin list ignores it (extension filter), but the Liquidsoap `playlist()` is pointed at the whole directory. Whether Liquidsoap picks the `.mmdb` for playback or skips it as undecodable depends on the running image and cannot be determined from the repo; the directory is `ls`-empty on the dev box, so it has not arisen there.
7. **Reload result is never checked.** `ReloadWatermarkClips` sends `watermark.reload` and ignores the reply. If the source was not built (kill switch flipped after a container booted) or the command name differs, the failure is silent. Whether the image's `playlist(id="watermark", reload_mode="never")` exposes a `watermark.reload` telnet command is only knowable against a live Liquidsoap; the repo tests stub telnet.
8. **Extension and MIME checks are separate.** Validation uses `mimes:` (content-sniffed), while `store()` trusts the client filename extension and throws an unhandled `RuntimeException` (a 500) if a file passes `mimes` but has a disallowed or mismatched extension. The saved extension follows the client name, not the content.
9. **Admin list cost.** `all()` runs `getID3::analyze` on every clip on every page load (and again in `totalBytes()`, and once per `index` call), with no caching. Fine for a handful of small files.
10. **Free plan and AutoDJ.** The design assumes free stations are live-only. If a free station ever had AutoDJ, the clip would duck music too; the `watermark_due` gate would also fire for `autodj_mix.is_ready()`.
11. **Interval floor differs from the config docs.** The config comment says do not go "below a couple of minutes"; the enforced floor is 60 s.
12. **No plan editor.** Flipping the flag for a plan is a manual DB change; `Plan` is fully guarded-off (`$guarded = []`), so mass assignment works from code but no UI or endpoint uses it.
13. **Dead API fields.** `watermarked` on `StationResource` and `UserResource` (plan block) is sent to clients that ignore it. `Station.ts` says to delete it if the feature is dropped.

## Tests

- `api/tests/Feature/WatermarkTest.php`: plan gating, kill switch, unresolvable owner, owner cannot switch it off, owner-only visibility, live push on plan change (running only), var.set syntax, interval floor, duck clamp.
- `api/tests/Feature/Admin/WatermarkClipTest.php`: listing, ignored extensions, empty-directory warning, upload plus reload dispatch, no overwrite, non-audio rejection, delete plus reload, path-traversal refusal, admin guard.
- `api/tests/Feature/ReloadWatermarkClipsTest.php`: reloads every running station, no-op when off, continues past an unreachable station.
- `api/tests/Feature/LiquidsoapTemplateTest.php`: renders the graph ("mixes the watermark over the station", position below the fallback, `output_source` left un-watermarked, silent when the station is silent).
- Not tested end to end: real Liquidsoap playback of a clip, real `watermark.reload`.

## History

- Migration dated 2026-08-18 added the plan flag. Related notes in the memory index ("Voice ID shelved") record that the feature was built but is off and should never appear in user-facing copy. The station-hardening and pricing docs under `docs/` mention it only in passing and are not the spec.
- Related features: [Liquidsoap station script](liquidsoap-station-script.md), [Liquidsoap supervisor](liquidsoap-supervisor.md), [Accounts, plans and invites](accounts-plans-invites.md), [Admin panel](admin-panel.md), [AutoDJ](autodj.md).
