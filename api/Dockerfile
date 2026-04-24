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
FROM dunglas/frankenphp:php8.4 AS base

# install-php-extensions is preinstalled by the FrankenPHP base image; it
# fetches and builds the requested extensions with correct flags. Much more
# reliable than hand-rolling apt + docker-php-ext-install.
RUN install-php-extensions pdo_mysql redis bcmath gd zip intl mbstring opcache

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

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

VOLUME ["/data", "/config"]
EXPOSE 80 443 443/udp
