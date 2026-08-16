# FrankenPHP — one container that serves HTTP, HTTPS, and PHP in one
# process. Replaces the nginx + php-fpm split with a simpler stack:
#
#   - Built on Caddy, which auto-negotiates Let's Encrypt certs
#   - HTTP/2 + HTTP/3 out of the box
#   - Laravel-endorsed (it's the engine Octane ships on by default)
#   - Same image handles web requests and the `queue:work` sidecar
#
# Multi-stage:
#   dev   → composer install WITH dev deps so Pest/Pint work in-container
#   prod  → composer install --no-dev, authoritative classmap, OPcache
#           tuned for Laravel, no dev tooling in the final image

# --------------------------------------------------------------------
# Shared base — PHP extensions, composer, workdir.
# --------------------------------------------------------------------
# Pinned to an exact FrankenPHP + PHP patch pair. `php8.4` alone is a moving
# tag: a rebuild months from now would silently pick up a different runtime,
# which is the kind of drift you only discover in production.
FROM dunglas/frankenphp:1.12.7-php8.4.24 AS base

# install-php-extensions is preinstalled by the FrankenPHP base image; it
# fetches and builds the requested extensions with correct flags. Much more
# reliable than hand-rolling apt + docker-php-ext-install.
RUN install-php-extensions pdo_mysql redis bcmath gd zip intl mbstring opcache

# Docker CLI — used by LiquidsoapSupervisor to spawn per-station Liquidsoap
# containers via the host's Docker socket (mounted into this container by
# compose). Only the CLI; the daemon stays on the host.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
  && chmod a+r /etc/apt/keyrings/docker.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
     > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli \
  && rm -rf /var/lib/apt/lists/*

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Override PHP defaults so audio uploads (≤50 MB per file, batches up to ~100 MB)
# aren't truncated before Laravel sees them. See api/php/uploads.ini for details.
COPY php/uploads.ini /usr/local/etc/php/conf.d/zz-uploads.ini

WORKDIR /app

# Base image CMD is already `frankenphp run --config /etc/caddy/Caddyfile`;
# no override needed for the web service. The queue service overrides this
# via docker-compose's `command:` to run the worker loop.

# --------------------------------------------------------------------
# Dev target — used by docker-compose.yml. Dev deps in vendor/, source
# bind-mounted from the host at runtime so edits hot-reload.
# --------------------------------------------------------------------
FROM base AS dev

COPY composer.json composer.lock ./
RUN composer install --no-scripts --no-autoloader --prefer-dist

COPY . .
RUN composer dump-autoload --optimize

COPY Caddyfile /etc/caddy/Caddyfile

VOLUME ["/data", "/config"]
EXPOSE 80 443 443/udp

# --------------------------------------------------------------------
# Prod target — used by docker-compose.prod.yml. No dev deps, classmap
# authoritative (never looks at the filesystem for class resolution),
# OPcache locked with validate_timestamps=0 for maximum throughput.
# --------------------------------------------------------------------
FROM base AS prod

COPY composer.json composer.lock ./
RUN composer install --no-scripts --no-autoloader --no-dev --prefer-dist

COPY . .
RUN composer dump-autoload --optimize --classmap-authoritative

# OPcache config for production. validate_timestamps=0 means PHP never
# re-checks the filesystem for file changes — deployments require a
# container restart, which is idiomatic for immutable-image deploys.
RUN { \
      echo 'opcache.enable=1'; \
      echo 'opcache.memory_consumption=256'; \
      echo 'opcache.interned_strings_buffer=16'; \
      echo 'opcache.max_accelerated_files=20000'; \
      echo 'opcache.validate_timestamps=0'; \
      echo 'opcache.revalidate_freq=0'; \
      echo 'opcache.save_comments=1'; \
      echo 'opcache.enable_file_override=1'; \
    } > /usr/local/etc/php/conf.d/99-opcache-prod.ini

COPY Caddyfile /etc/caddy/Caddyfile

# --------------------------------------------------------------------
# Drop root.
#
# This is the container with Docker API access (via the socket proxy), so
# it's the one where running as uid 0 compounds worst: code execution in PHP
# would otherwise start from root inside the container.
#
# Three things make this work:
#
#  1. GID 101 is not arbitrary. /var/gocast on the host is owned 100:101
#     (the `liquidsoap` user inside savonet/liquidsoap) with mode 0775, and
#     Laravel must write .liq files and playlist dirs there. Giving this user
#     gid 101 as its primary group is what grants that write access without
#     loosening permissions to 0777. Keep it in sync with infra/setup-host.sh.
#
#  2. Binding :80/:443 as non-root works because the FrankenPHP base image
#     already ships the binary with cap_net_bind_service=ep. Verify with
#     `getcap /usr/local/bin/frankenphp` after a base image bump — if a future
#     image drops it, this container will fail to bind and the fix is a
#     `setcap` line here, not a return to root.
#
#  3. /data and /config are Caddy's TLS state, /app/storage is Laravel's.
#     Chowning them in the image matters because a NEW named volume inherits
#     the ownership of the image directory it shadows.
#
# NOTE for an existing deployment: a volume that already exists keeps its old
# root ownership — Docker only copies ownership when it first creates one. On
# a host that ran the earlier root image, chown the volume once:
#   docker compose run --rm --user root --entrypoint chown api -R 1001:101 /app/storage
#
# The dev target above deliberately stays root: it bind-mounts the source tree
# from the host, and a fixed uid in the image can't match every developer's
# host uid. Development containers aren't the threat model here.
# --------------------------------------------------------------------
RUN groupadd -g 101 gocast \
  && useradd -u 1001 -g 101 -m -s /usr/sbin/nologin gocast \
  && chown -R gocast:gocast /app /data /config

USER gocast

VOLUME ["/data", "/config"]
EXPOSE 80 443 443/udp
