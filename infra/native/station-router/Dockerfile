# The station router, with njs.
#
# This container used to be a bare `nginx:alpine` with a config mounted in. It
# needs a Dockerfile now because external-encoder ingest is routed by an njs
# script in the `stream` block, and the njs module is not in the base image.
#
# BOTH VERSIONS ARE PINNED, AND THEY ARE ONE DECISION.
#
# nginx's dynamic modules are compiled against an exact nginx version and
# refuse to load against any other:
#
#   module "ngx_stream_js_module.so" version 1029008 instead of 1029009
#
# which is a container that will not start — taking /broadcast/{slug} down with
# it, so the studio stops working too, not just the encoders. Floating the base
# tag at `1.29-alpine` while pinning the module guarantees that the day the tag
# moves. Bump the two together, or neither.
FROM nginx:1.29.8-alpine

# nginx's own Alpine repository, not Alpine's. The signing key is already in
# /etc/apk/keys in the official image; only the repository line is missing.
# The Alpine community package (`nginx-mod-stream-js`) is built against
# Alpine's nginx, which is a different build from this image's.
RUN apk add --no-cache \
      --repository https://nginx.org/packages/alpine/v3.23/main \
      nginx-module-njs=1.29.8.0.9.6-r1

# nginx.conf and ingest.js are still bind-mounted rather than copied, so a
# routing change is `docker compose restart station-router` and not a rebuild.
# The image exists only to carry the module.
