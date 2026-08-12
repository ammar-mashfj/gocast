# GoCast — Production Deploy Runbook

A step-by-step guide for deploying GoCast to a **fresh VPS** for the first
time. Assumes Ubuntu 24.04 LTS (Noble) and that you're new to Docker in
production. Read each phase top-to-bottom; don't skip the verification
steps — they catch 90% of mistakes before they bite you at 2 AM.

> **One-line mental model:** Most of GoCast runs in Docker containers
> defined by `docker-compose.yml`. MySQL is the exception — it lives on
> the **host** (outside Docker) because containerized DBs add I/O
> overhead and complicate backups. Containers reach it via
> `host.docker.internal`.

---

## 0. What you need before you start

Gather these first — you will be stuck without them:

| Thing | Why | How to get it |
|---|---|---|
| A VPS with public IPv4 | Listeners and broadcasters connect to it | See sizing below |
| Root or sudo SSH access | To install packages, open ports | Provided by your VPS provider |
| A registered domain (e.g. `gocast.fm`) | TLS + nice URLs | Namecheap, Porkbun, Cloudflare Registrar |
| Cloudflare account with the domain added | DNS + edge TLS + DDoS protection | Free tier is enough |
| S3-compatible bucket for backups | Nightly DB + uploads dumps | Cloudflare R2 is cheapest; B2/AWS S3/MinIO also work |
| Sentry project (optional) | Error tracking for client + server | Free tier OK for small traffic |
| Google OAuth credentials (optional) | "Sign in with Google" on the app | Google Cloud Console → APIs → Credentials → OAuth 2.0 Client ID |

### VPS sizing (rough)

- **MVP / pre-launch** (< 50 concurrent listeners, < 5 stations):
  2 vCPU / 4 GB RAM / 80 GB SSD. ~€8–15/month at Hetzner, DigitalOcean,
  Vultr. **CCX13 / DO Premium-AMD-4GB** is a sane baseline.
- **Small launch** (< 500 concurrent listeners, < 50 stations):
  4 vCPU / 8 GB RAM / 160 GB SSD. Each per-station Liquidsoap container
  uses ~50 MB RAM idle, ~100 MB encoding.
- **Region**: pick close to your broadcasters (WHIP latency matters more
  than listener latency, because Icecast is buffered).
- **Network**: confirm UDP is unblocked (some budget providers throttle
  UDP — WebRTC needs it).

### Domain & DNS plan

You will end up with **four** subdomains, all pointing at the same VPS IP:

| Hostname | Purpose | Cloudflare proxy? |
|---|---|---|
| `gocast.fm` | Public app (Next.js client) | ✅ Proxied (orange cloud) |
| `api.gocast.fm` | Laravel API + Filament admin | ✅ Proxied |
| `icecast.gocast.fm` | Listener-facing audio stream | ✅ Proxied |
| `stream.gocast.fm` | WHIP/RTMP/SRT broadcaster ingest + HLS | ❌ **DNS only** (grey cloud) — WebRTC needs direct UDP |

> **Critical:** `stream.gocast.fm` MUST be grey-cloud (DNS-only).
> Cloudflare's proxy doesn't pass through WebRTC UDP candidates;
> broadcasters will see "ICE failed" if you proxy this one.

Because that hostname is grey-clouded, **the broadcaster's browser validates
its certificate directly** — there's no Cloudflare edge in between. So Caddy
(in the api container) serves it as a second vhost with an automatic Let's
Encrypt cert, and reverse-proxies the WHIP signalling to MediaMTX. Two
consequences:

- A Cloudflare **Origin** Certificate does not work for this hostname — those
  are only trusted by Cloudflare's edge, not by browsers. The API vhost can
  use one; this vhost always uses Let's Encrypt. `api/Caddyfile` and
  `api/Caddyfile.cloudflare` both handle this correctly.
- Port **80 must stay open** so Caddy can complete the ACME HTTP-01 challenge
  for `stream.gocast.fm`, and port **443** is what broadcasters actually POST
  their WHIP offer to. MediaMTX's own `:8889` is never reached from the public
  internet — only from Caddy, over the Docker bridge.

This is what makes "go live" work at all in production: a page served over
HTTPS cannot POST a WHIP offer to a plain-HTTP endpoint (mixed content), and
MediaMTX speaks plain HTTP (`webrtcEncryption: no`). Only the SDP exchange is
proxied — media still flows as UDP straight to MediaMTX on `:8189`.

---

## 1. VPS first-touch hardening (~10 min)

SSH in as `root` (or whatever user the provider gave you). Replace `IP`
with your actual VPS IP.

```bash
ssh root@IP
```

### 1.1 Update everything

```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg lsb-release \
               ufw fail2ban unattended-upgrades \
               git rsync htop tmux jq
```

### 1.2 Create a non-root deploy user

Don't deploy as root.

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# Allow passwordless sudo for deploy (needed by deploy.sh)
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
chmod 0440 /etc/sudoers.d/deploy

# Copy your SSH key from root to deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **new terminal** and confirm `ssh deploy@IP` works before
closing the root session. From here on, all commands run as `deploy`.

### 1.3 Disable root SSH + password auth

Edit `/etc/ssh/sshd_config`:

```bash
sudo sed -i 's/^#*PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 1.4 Firewall — only open what GoCast needs

```bash
# Default deny inbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (keep this OPEN before enabling ufw or you'll lock yourself out)
sudo ufw allow 22/tcp

# HTTP / HTTPS (Caddy on api container, Cloudflare connects here)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # HTTP/3 (QUIC)

# Icecast listener stream (host:8888 → container:8000)
sudo ufw allow 8888/tcp

# MediaMTX WebRTC media. UDP only — this one is genuinely public, it's how
# broadcaster audio reaches the box.
sudo ufw allow 8189/udp   # WebRTC ICE/UDP

# MediaMTX WHIP signalling (:8889, plain HTTP) does NOT need a public rule —
# Caddy terminates TLS on :443 for stream.gocast.fm and proxies to it over the
# Docker bridge. Allow only that hop. 172.16.0.0/12 covers Docker's default
# address pools; check `docker network inspect gocast-network` if you've
# customised them.
sudo ufw allow from 172.16.0.0/12 to any port 8889 proto tcp

# MediaMTX RTMP (OBS broadcasters)
sudo ufw allow 1935/tcp

# MediaMTX SRT (pro broadcasters)
sudo ufw allow 8890/udp

sudo ufw enable
sudo ufw status verbose
```

> If you don't need RTMP/SRT (browser-only broadcasters), close 1935 and
> 8890 — fewer open ports is better.

### 1.5 Enable automatic security updates

```bash
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 1.6 Swap (critical for small VPSes)

Builds (Next.js + composer install) can OOM on 4 GB RAM. Add 4 GB swap:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
```

### ✅ Verify phase 1

```bash
free -h               # see swap line non-zero
sudo ufw status       # see all the ports
who                   # only your session
sudo journalctl --since "5 min ago" -u ssh | tail
```

---

## 2. Cloudflare DNS records (~5 min)

In Cloudflare dashboard → your domain → **DNS** → **Records** → add:

```
A    gocast.fm           IP    Proxied  (orange)
A    api.gocast.fm       IP    Proxied  (orange)
A    icecast.gocast.fm   IP    Proxied  (orange)
A    stream.gocast.fm    IP    DNS only (grey) ← important
```

Cloudflare → **SSL/TLS** → **Overview** → set mode to **Full (strict)**.
*Anything less (Flexible, Full-not-strict) will either break your app or
serve plaintext between Cloudflare and your origin.*

Cloudflare → **SSL/TLS** → **Origin Server** → **Create Certificate**
(optional but recommended): generates a CF-issued cert for your origin.
If you want to use it, save the cert + key into `infra/certs/` later
when you copy the repo.

### Wait for DNS

```bash
dig +short api.gocast.fm    # should return Cloudflare IPs (proxied)
dig +short stream.gocast.fm # should return YOUR VPS IP (direct)
```

---

## 3. Install Docker on the VPS (~5 min)

Use Docker's official repo, not the apt-shipped version (which is older).

```bash
# Remove any old docker bits
sudo apt remove -y docker docker-engine docker.io containerd runc || true

# Docker's official GPG + repo
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

# Let deploy user run docker without sudo
sudo usermod -aG docker deploy

# Apply the group change (or just log out + back in)
newgrp docker
```

### ✅ Verify

```bash
docker --version            # 27.x or newer
docker compose version      # v2.x
docker run --rm hello-world # should print a friendly hello
```

---

## 4. Install MySQL on the host (~10 min)

**Why on the host?** Containerized MySQL multiplies I/O overhead and
makes backups awkward. The compose file is explicitly designed around
host MySQL — containers reach it via `host.docker.internal`.

```bash
sudo apt install -y mysql-server mysql-client
sudo systemctl enable --now mysql

# Lock it down (set root password, remove anon users, etc.)
sudo mysql_secure_installation
```

When prompted:
- Set a strong root password (save it in your password manager)
- Remove anonymous users: **Y**
- Disallow root login remotely: **Y**
- Remove test database: **Y**
- Reload privilege tables: **Y**

### 4.1 Create database + user

```bash
sudo mysql -u root -p
```

Inside the MySQL prompt:

```sql
CREATE DATABASE gocast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use a strong password and save it — you'll need it for .env
CREATE USER 'gocast'@'%' IDENTIFIED BY 'CHANGE_ME_LONG_RANDOM_STRING';
GRANT ALL PRIVILEGES ON gocast.* TO 'gocast'@'%';
FLUSH PRIVILEGES;
EXIT;
```

### 4.2 Allow connections from Docker containers

By default MySQL binds to `127.0.0.1` only — Docker bridge containers
can't reach that. Bind it to all interfaces:

```bash
sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo sed -i 's/^mysqlx-bind-address.*/mysqlx-bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

> **Don't worry — this isn't a security hole.** Your `ufw` firewall
> blocks port 3306 from the public internet. Only the Docker bridge
> network (and you on `localhost`) can reach it.

### ✅ Verify

```bash
# From the host
mysql -u gocast -p -h 127.0.0.1 -e "SELECT 1;" gocast

# From inside Docker (just to be sure)
docker run --rm --add-host=host.docker.internal:host-gateway \
  mysql:8.0 mysql -h host.docker.internal -u gocast -p -e "SELECT 1;" gocast
```

---

## 5. Clone GoCast + configure secrets (~15 min)

```bash
cd /opt
sudo mkdir gocast
sudo chown deploy:deploy gocast
cd gocast

git clone https://github.com/YOUR_USERNAME/gocast.git .
# (If your repo is private, set up a deploy key first.)
```

### 5.1 Generate secrets

You need strong random values for several variables. Generate them all
in one go:

```bash
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
echo "ICECAST_SOURCE_PASSWORD=$(openssl rand -hex 24)"
echo "ICECAST_ADMIN_PASSWORD=$(openssl rand -hex 24)"
echo "MYSQL_PASSWORD=<the password you set in step 4.1>"
echo "APP_KEY=base64:$(openssl rand -base64 32)"
```

Copy each line into your password manager. You'll paste them in next.

### 5.2 Create the root `.env`

```bash
cp .env.docker.example .env
nano .env
```

Fill in **every** value:

```bash
# Host MySQL (what you created in step 4.1)
MYSQL_DATABASE=gocast
MYSQL_USER=gocast
MYSQL_PASSWORD=<from step 5.1>
MYSQL_ROOT_PASSWORD=<MySQL root password from step 4>

# Icecast (rotated everywhere by these vars alone)
ICECAST_SOURCE_PASSWORD=<from step 5.1>
ICECAST_RELAY_PASSWORD=<from step 5.1>
ICECAST_ADMIN_USER=admin
ICECAST_ADMIN_PASSWORD=<from step 5.1>

# Shared secret for MediaMTX/Liquidsoap → api webhooks.
# MUST be set (the VerifyInternalKey middleware throws if empty).
INTERNAL_API_KEY=<from step 5.1>

# Tells Caddy/FrankenPHP what hostname to serve.
# This triggers auto Let's Encrypt issuance — DNS must already point here.
SERVER_NAME=api.gocast.fm

# These are inlined into the client bundle at build time.
API_HOSTNAME=api.gocast.fm
APP_HOSTNAME=gocast.fm
ICECAST_HOSTNAME=icecast.gocast.fm
WHIP_HOSTNAME=stream.gocast.fm

# Sentry (leave blank if not using yet)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### 5.3 Create `api/.env` (Laravel-specific)

```bash
cp api/.env.example api/.env
nano api/.env
```

Set at minimum:

```bash
APP_NAME=GoCast
APP_ENV=production
APP_KEY=<from step 5.1 — paste the full "base64:..." string>
APP_DEBUG=false
APP_URL=https://api.gocast.fm

LOG_CHANNEL=stack
LOG_LEVEL=warning   # 'debug' will fill your disk fast in prod

# Database — these are also set by compose's environment block but having
# them here means `php artisan tinker` on the host also works.
DB_CONNECTION=mysql
DB_HOST=host.docker.internal
DB_PORT=3306
DB_DATABASE=gocast
DB_USERNAME=gocast
DB_PASSWORD=<same as MYSQL_PASSWORD>

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null

CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis

# Mail — pick a transactional sender (Postmark, Resend, SES, Mailgun).
# Don't try to run your own MTA; modern mail providers will silently
# blackhole VPS-origin mail.
MAIL_MAILER=resend
RESEND_KEY=
MAIL_FROM_ADDRESS=hello@gocast.fm
MAIL_FROM_NAME=GoCast

# Google OAuth (Socialite) — only if you want "Sign in with Google"
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.gocast.fm/api/auth/google/callback

# Sentry Laravel DSN (different from the client one)
SENTRY_LARAVEL_DSN=

# Frontend URL — used in email links etc.
APP_FRONTEND_URL=https://gocast.fm
```

Lock the file down:

```bash
chmod 600 .env api/.env
```

### 5.4 (Optional) Cloudflare Origin Certificate

If you generated one in step 2, drop the cert + key into `infra/certs/`:

```bash
mkdir -p infra/certs
nano infra/certs/origin.pem   # paste the cert
nano infra/certs/origin.key   # paste the private key
chmod 600 infra/certs/origin.key
```

This eliminates Let's Encrypt entirely — Cloudflare trusts CF-issued
origin certs by default. Simpler than Let's Encrypt rate-limit anxiety.
If you skip this, FrankenPHP/Caddy will auto-issue via Let's Encrypt,
which works fine as long as ports 80 + 443 are reachable from the
public internet (which they are after step 1.4).

---

## 6. First deploy (~5–10 min, mostly build time)

```bash
cd /opt/gocast
./deploy.sh
```

This script (which you should read once — it's ~50 lines):

1. `git pull --ff-only`
2. Runs `infra/setup-host.sh` — creates `/var/gocast/{liq,playlists,hls}`
   with correct ownership, ensures the `gocast-network` Docker network
   exists, and builds the `gocast/liquidsoap:latest` image.
3. `docker compose build` — builds the api + client + icecast images.
   First build is slow (~5–10 min); cached layers make subsequent
   deploys fast.
4. `docker compose up -d --remove-orphans` — starts everything.
5. `php artisan migrate --force` — runs migrations.
6. `php artisan config:cache` / `route:cache` / `event:cache` — Laravel
   prod optimisations.
7. `php artisan stations:relaunch` — spawns a Liquidsoap container per
   station (idempotent — no-op if you have no stations yet).
8. `php artisan stations:reconcile` — kills orphaned per-station
   containers whose Station row is gone.

### ✅ Verify the deploy

```bash
docker compose ps      # all services should show "Up X (healthy)"
docker compose logs api --tail=50
```

Look for these in `api` logs:

- `Application started successfully` from FrankenPHP
- No `RuntimeException: INTERNAL_API_KEY is not configured`
- `[INFO]` lines about Caddy obtaining certificates (first boot only)

Test from your laptop:

```bash
curl -I https://api.gocast.fm/up
# HTTP/2 200

curl -I https://gocast.fm
# HTTP/2 200

# The ingest vhost. 404 is the expected answer here — it proves TLS is
# terminating and Caddy is reaching MediaMTX, which has no such path.
# A cert error or a connection refusal means the WHIP vhost isn't up, and
# broadcasters will not be able to go live.
curl -I https://stream.gocast.fm/nonexistent/live/whip
```

Confirm the scheduler is ticking (this is what keeps listener counts alive):

```bash
docker compose logs scheduler --tail=20
# Expect a "Running [stations:sync-listeners]" line within a minute
```

If `https://api.gocast.fm` returns a Cloudflare 521/522, your origin
isn't responding on 443 — check `docker compose logs api` for cert
errors and confirm ports 80/443 are open in `ufw` and the VPS
provider's network policy.

---

## 7. Create the first admin user (~2 min)

The Filament admin panel lives at `https://api.gocast.fm/admin`.

```bash
docker compose exec api php artisan admin:create
```

Follow the prompts (email + password). Then log in at
`https://api.gocast.fm/admin` and verify you can see the dashboard.

---

## 8. Smoke-test the broadcaster pipeline (~5 min)

This is the moment of truth — end-to-end audio.

1. Open `https://gocast.fm` in your browser.
2. Sign up. Verify the email (check your transactional sender's
   dashboard if it doesn't arrive — DNS for SPF/DKIM takes time to
   propagate).
3. Create a station from the dashboard.
4. Go to the station's **Studio** page. Click **Go Live**, grant mic
   permission. Speak.
5. In a second browser (or incognito) open the station's public page
   (`https://gocast.fm/station/your-slug`). Hit play. You should hear
   yourself ~5–10s delayed (Icecast burst-size buffer).

### If audio doesn't reach the listener:

```bash
# 1. Did MediaMTX receive the publish?
docker compose logs mediamtx --tail=30 | grep -i publish

# 2. Did the per-station Liquidsoap container come up?
docker ps | grep gocast-liquidsoap

# 3. Did the api get the whip-ready webhook?
docker compose logs api --tail=30 | grep -i whip-ready

# 4. Is Icecast serving the mount?
curl -sI https://icecast.gocast.fm/your-slug
# Expect: HTTP/2 200, Content-Type: audio/mpeg
```

Most common failure: `whip-ready` never fires because MediaMTX can't
reach the api. Fix: confirm `INTERNAL_API_URL` in compose resolves to a
working URL from inside `host`-networked mediamtx (default is
`http://localhost:80`, which works on a vanilla setup).

---

## 9. Set up nightly backups (~10 min)

Restoring is a separate skill — practise it BEFORE you need it.

### 9.1 Install AWS CLI

```bash
sudo apt install -y awscli
```

### 9.2 Configure S3-compatible credentials

For Cloudflare R2:

```bash
# Add to /home/deploy/.aws/credentials (create if missing)
mkdir -p ~/.aws
nano ~/.aws/credentials
```

```ini
[default]
aws_access_key_id     = YOUR_R2_ACCESS_KEY
aws_secret_access_key = YOUR_R2_SECRET_KEY
```

```bash
nano ~/.aws/config
```

```ini
[default]
region = auto
endpoint_url = https://<accountid>.r2.cloudflarestorage.com
```

Or set these in `/opt/gocast/.env`:

```bash
BACKUP_S3_BUCKET=gocast-backups
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_ENDPOINT_URL_S3=https://<accountid>.r2.cloudflarestorage.com
```

### 9.3 Test once manually

```bash
cd /opt/gocast
./backup.sh
```

You should see four uploads succeed (mysql, uploads, caddy_data,
playlists). Confirm they appear in the R2 dashboard.

### 9.4 Schedule via cron

```bash
sudo crontab -u deploy -e
```

Append:

```
# Nightly backup at 03:00 UTC
0 3 * * * /opt/gocast/backup.sh >> /var/log/gocast-backup.log 2>&1
```

> This is the **only** host crontab entry you need. Laravel's own scheduled
> commands (listener-count polling, container reconcile, login-abuse
> detection, the day-7 nudge) run inside the `scheduler` service via
> `schedule:work` — no `artisan schedule:run` cron line required.

### 9.5 Set a 30-day lifecycle rule on the bucket

In R2/S3 console, on the `gocast-backups` bucket, add a lifecycle rule
that deletes objects older than 30 days. `backup.sh` deliberately
doesn't manage retention itself (race conditions on concurrent runs are
easy to get wrong).

### ✅ Verify

After 24 hours, check `/var/log/gocast-backup.log` for the success
banner and verify a fresh backup landed in S3.

---

## 10. Day-to-day operations

### Deploy a code update

```bash
cd /opt/gocast
./deploy.sh
```

That's it. The script is idempotent and downtime is roughly 5–15s
(container restart). If you need true zero-downtime, you'll want a
blue/green setup — out of scope for this guide.

### View live logs

```bash
# All services
docker compose logs -f --tail=100

# One service
docker compose logs -f api
docker compose logs -f mediamtx
docker compose logs -f icecast

# A specific Liquidsoap station
docker logs -f gocast-liquidsoap-your-slug
```

### Open a shell in the api container (for tinker, artisan, etc.)

```bash
docker compose exec api bash
# Then: php artisan tinker / php artisan queue:work / etc.
```

### Restart one service without touching others

```bash
docker compose restart api
docker compose restart mediamtx
```

### See per-station Liquidsoap status

```bash
docker compose exec api php artisan stations:reconcile --dry-run
docker ps --filter name=gocast-liquidsoap-
```

### Disk usage

```bash
docker system df              # docker's view
du -sh /var/gocast/*          # per-station data
docker volume ls              # named volumes (redis, caddy_data, api_storage)
```

Run `docker system prune -af --volumes` periodically (monthly?) to
reclaim space from dead images. **Beware:** `--volumes` is destructive
if you have unmounted named volumes you care about. The named volumes
in `docker-compose.yml` (`redis_data`, `caddy_data`, `api_storage`) are
attached and won't be pruned while compose is running.

---

## 11. Troubleshooting — the things that will go wrong

### "HTTP/2 521" or "522" from Cloudflare

Origin isn't responding. In order:

1. `docker compose ps` — are services healthy?
2. `sudo ufw status` — are 443 and 80 open?
3. `docker compose logs api --tail=100` — Caddy cert errors?
4. From the VPS itself: `curl -I http://localhost/up` (works without TLS)
   and `curl -kI https://localhost/up` (works on the cert Caddy issued)

### "INTERNAL_API_KEY is not configured" in api logs

Your `.env` doesn't have `INTERNAL_API_KEY` set, or it's empty. The
`VerifyInternalKey` middleware throws loudly on purpose — silently
401'ing was the worse bug. Fix the env, then `docker compose up -d`
(it'll re-read).

### "Go live" fails immediately, before any ICE activity

The WHIP offer never reached MediaMTX. Check the browser console for a mixed
content or TLS error on `https://stream.gocast.fm/...`, then:

```bash
# Is the ingest vhost terminating TLS? (404 = healthy, see verify above)
curl -I https://stream.gocast.fm/nonexistent/live/whip

# Did Caddy get a cert for the ingest hostname?
docker compose logs api | grep -i "stream.gocast.fm"

# Can Caddy actually reach MediaMTX over the bridge?
docker compose exec api curl -sS -o /dev/null -w '%{http_code}\n' \
  http://host.docker.internal:8889/
```

Common causes, in order:
- `WHIP_HOSTNAME` in the root `.env` doesn't match the DNS record, so Caddy is
  serving a vhost nobody requests (and ACME failed for the real name).
- Port 80 closed, so the ACME HTTP-01 challenge for the ingest hostname can't
  complete — no cert, no TLS.
- The ingest hostname is orange-clouded, so Cloudflare answers `:443` with its
  own edge cert and the SDP POST never arrives (and UDP media would fail too).
- `ufw` is dropping the bridge → host hop on `:8889`.

### Broadcaster sees "ICE failed" / can't connect

Distinct from the above: signalling succeeded (the SDP round-trip worked) but
media can't flow. Almost certainly `stream.gocast.fm` is orange-clouded in
Cloudflare — WebRTC's UDP candidates don't pass through CF's proxy. Set it to
grey (DNS only).

If grey-cloud is set and it still fails:
- Confirm UDP 8189 is open in `ufw`
- Confirm your VPS provider isn't throttling UDP
- Check `docker compose logs mediamtx` for ICE errors

### Listener counts are stuck at 0

Counts come from `stations:sync-listeners`, which polls Icecast's admin API
once a minute — nothing pushes them. If every station reads 0:

```bash
docker compose logs scheduler --tail=30
docker compose exec api php artisan stations:sync-listeners
```

The command prints how many stations it synced. If it fails, the usual cause
is `ICECAST_ADMIN_PASSWORD` in `api/.env` not matching the value the icecast
service was started with (rotate both together, then recreate both).

### Listeners hear silence / dropouts

```bash
# Is the per-station Liquidsoap container running?
docker ps --filter name=gocast-liquidsoap-your-slug

# What is it doing right now?
docker logs gocast-liquidsoap-your-slug --tail=50
```

If the container is missing, restart it via:

```bash
docker compose exec api php artisan stations:relaunch --slug=your-slug
```

### Disk filling up

Most likely cause: log retention on Docker.

```bash
# Check sizes
du -sh /var/lib/docker/containers/*/

# Set log rotation globally — edit /etc/docker/daemon.json
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

```bash
sudo systemctl restart docker
```

### "Cannot start service: bind: address already in use"

Some other process owns the port. Find it:

```bash
sudo ss -tulpn | grep :443
```

Usually it's an old standalone Caddy, nginx, or another docker compose
project. Stop the rogue process, then `docker compose up -d`.

### MySQL: "Too many connections"

Edit `/etc/mysql/mysql.conf.d/mysqld.cnf`, raise `max_connections` from
the default 151 to 500, restart mysql.

### Migrations fail mid-deploy

```bash
docker compose exec api php artisan migrate --force
# If you need to roll one back:
docker compose exec api php artisan migrate:rollback --step=1
```

Don't manually edit the `migrations` table unless you fully understand
the consequences.

---

## 12. Disaster recovery — restore from backup

Practise this **before** you need it. Spin up a second cheap VPS, run
through this end-to-end, then tear it down. The first time you do this
under pressure is too late to discover that backup #6 was corrupted.

### Restore MySQL

```bash
aws s3 cp s3://gocast-backups/mysql/mysql-YYYY-MM-DDTHH-MM-SSZ.sql.gz .
gunzip mysql-*.sql.gz
mysql -u gocast -p gocast < mysql-*.sql
```

### Restore uploads

```bash
aws s3 cp s3://gocast-backups/uploads/uploads-YYYY-MM-DDTHH-MM-SSZ.tar.gz .
docker compose exec -T api tar -xzf - -C /app/storage/app < uploads-*.tar.gz
```

### Restore Caddy TLS state

```bash
aws s3 cp s3://gocast-backups/caddy_data/caddy_data-YYYY-MM-DDTHH-MM-SSZ.tar.gz .
docker run --rm -v gocast_caddy_data:/dest -v "$(pwd)":/backup alpine \
  tar -xzf /backup/caddy_data-*.tar.gz -C /dest
docker compose restart api
```

### Restore station playlists

```bash
aws s3 cp s3://gocast-backups/playlists/playlists-YYYY-MM-DDTHH-MM-SSZ.tar.gz .
sudo tar -xzf playlists-*.tar.gz -C /var/gocast
sudo chown -R 100:101 /var/gocast/playlists
```

Then relaunch per-station Liquidsoap:

```bash
docker compose exec api php artisan stations:relaunch
```

---

## 13. What to do next (after first launch)

- **Monitor**: hit `https://api.gocast.fm/api/internal/metrics` with the
  `X-Internal-Key` header from a Prometheus / Grafana Agent / Vector
  scrape job. Set alerts on `expected_containers != actual_containers`
  and on queue depth.
- **Status page**: hook up `https://api.gocast.fm/up` to an uptime
  monitor (UptimeRobot, BetterStack, Pingdom).
- **Log aggregation**: pipe `docker compose logs` to Loki / Datadog /
  Papertrail. `docker compose logs` rotation alone is not a logging
  strategy.
- **Sentry**: fill in `SENTRY_LARAVEL_DSN` (api/.env) and
  `NEXT_PUBLIC_SENTRY_DSN` (.env at repo root, build arg) — both are
  no-ops if unset, so it's safe to add later.

---

## Appendix: Key file locations on the VPS

| Path | What |
|---|---|
| `/opt/gocast/` | The repo |
| `/opt/gocast/.env` | Root env (compose) |
| `/opt/gocast/api/.env` | Laravel env |
| `/opt/gocast/infra/certs/` | Optional Cloudflare Origin cert |
| `/var/gocast/liq/` | Generated per-station `.liq` files |
| `/var/gocast/playlists/<slug>/` | Per-station uploaded audio |
| `/var/gocast/hls/<slug>/` | Rolling HLS segments, served at `https://stream.gocast.fm/<slug>/playlist.m3u8` |
| `/var/log/gocast-backup.log` | Backup cron output |
| `/etc/mysql/mysql.conf.d/mysqld.cnf` | MySQL config |
| `/etc/ssh/sshd_config` | SSH config |
| Docker volumes: `gocast_redis_data`, `gocast_caddy_data`, `gocast_api_storage` | Persistent data |

## Appendix: One-line health check

After deploy, this command tells you in one glance whether the system is healthy:

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}" && \
  echo "---" && \
  curl -sf https://api.gocast.fm/up >/dev/null && echo "✓ api up" || echo "✗ api DOWN" && \
  curl -sf https://gocast.fm >/dev/null && echo "✓ client up" || echo "✗ client DOWN" && \
  curl -sf "https://icecast.gocast.fm/status-json.xsl" >/dev/null && echo "✓ icecast up" || echo "✗ icecast DOWN"
```

Save it as `/opt/gocast/healthcheck.sh` for quick re-runs.
