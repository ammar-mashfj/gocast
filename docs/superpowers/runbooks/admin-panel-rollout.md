# Admin Panel — Production Rollout Runbook

1. **Branch merge.** PR `feature/admin-panel` into `main`. Verify CI green.
2. **DNS.** Add an A/CNAME record for `admin.gocast.ai` pointing to the same host as `api.gocast.ai`.
3. **Nginx.** Add a server block for `admin.gocast.ai` that proxies to the existing Laravel app (or aliases the same document root). Reload nginx.
4. **TLS.** Issue a certificate for `admin.gocast.ai` via the existing certbot / provider flow. Confirm HTTPS works.
5. **Deploy.** Run the normal deploy script. Ensure `php artisan migrate --force` runs (adds `admins`, `activity_log`, `authentication_log`, `notifications`, `users.deleted_at`, `users.last_login_at`, `stations.deleted_at`).
6. **Env.** Add `ADMIN_DOMAIN=admin.gocast.ai` to production env; `php artisan config:cache` after.
7. **Scheduler.** Confirm the server's cron runs `php artisan schedule:run` every minute. `admin:detect-login-abuse` relies on it (fires every 5 minutes).
8. **Create first admin.** `php artisan admin:create founder@gocast.ai --name="Ammar" --password="<strong-password>"`. Password must be ≥12 characters.
9. **First login.** Visit `https://admin.gocast.ai/admin/login`. Filament forces 2FA enrolment before the dashboard loads. Complete enrolment with an authenticator app and store recovery codes somewhere safe (1Password).
10. **Smoke test.** Click every nav link: Users & Content → Users/Stations/StreamSessions; Catalog → Plans/WaitlistEntries; System → Admins/ActivityLogs/AuthenticationLogs. Confirm no 500s and that stats/widgets show production data.
11. **Alert trial.** In an incognito window, attempt 11 admin logins with bad credentials. Within 5 minutes, confirm the bell icon in the admin panel shows a "login abuse detected" notification and Sentry captured a critical log entry. Delete the trial notification afterwards.
12. **Sentry.** Confirm the admin panel's critical logs land in the same Sentry project as the customer app (Sentry is already wired via `sentry/sentry-laravel`).

## Rollback
- Revert the merge commit. Run `php artisan migrate:rollback --step=<count-of-new-migrations>`. Remove the nginx server block. DNS record can stay.
- The `admins` table is standalone; rolling it back does not affect customer data. `users.deleted_at`, `stations.deleted_at`, `users.last_login_at` are additive and safe to leave in place if a partial rollback is preferred.

## Future work
- Add the relay `POST /control/kick` endpoint + SPA close-code handler when the team wants live-broadcast interrupts (currently out of v1 scope).
- Add user suspension end-to-end (requires SPA changes).
- Add impersonation with a cross-domain token bridge (requires SPA changes).
- Swap `Color::Amber` for the GoCast brand primary when branding lands.
- Introduce an `admin.gocast.ai` IP allowlist at the nginx/Cloudflare edge.
- Migrate to a Vite-based Filament theme for full visual customization.
