#!/usr/bin/env bash
# Limit ports 80 and 443 to Cloudflare's edges in ufw.
#
#   sudo bash infra/native/ufw-cloudflare-only.sh --icecast-is-elsewhere
#
# The nginx guard ($from_cloudflare, conf.d/cloudflare-realip.conf) already
# answers non-Cloudflare connections to the public vhosts with 444. This moves
# the refusal down to the firewall, so the origin stops answering at all — no
# TLS handshake, no nginx, nothing for a scanner to fingerprint.
#
# DO NOT RUN while icecast.gocast.fm (DNS-only) still points at this server:
# its listeners connect to 80/443 directly, not through Cloudflare, and would
# all be cut off. Move Icecast to its own address first (2026-10-27 review,
# follow-up "move Icecast"); the flag is there so nobody runs this by habit.
#
# Ranges come from conf.d/cloudflare-realip.conf, so nginx and ufw always
# agree; security:check-cloudflare-ranges warns when Cloudflare's list moves.
# Re-run after updating that file. Loopback is never filtered by ufw, so
# tooling on the box keeps working.
set -euo pipefail

if [[ "${1:-}" != "--icecast-is-elsewhere" ]]; then
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

CONF=/etc/nginx/conf.d/cloudflare-realip.conf
[[ -r "$CONF" ]] || { echo "Missing $CONF; run setup-native.sh first." >&2; exit 1; }

mapfile -t RANGES < <(sed -n 's/^set_real_ip_from[[:space:]]\+\([^;]\+\);.*/\1/p' "$CONF")
(( ${#RANGES[@]} >= 10 )) || { echo "Only ${#RANGES[@]} ranges in $CONF; refusing." >&2; exit 1; }

echo "==> Allowing 80,443 from ${#RANGES[@]} Cloudflare ranges"
for range in "${RANGES[@]}"; do
  ufw allow proto tcp from "$range" to any port 80,443 comment 'cloudflare' >/dev/null
done

echo "==> Removing the open-to-everyone rules"
# Both spellings setup-native.sh and a hand-run `ufw allow` may have left.
for rule in '80/tcp' '443/tcp' '80' '443' 'Nginx Full' 'Nginx HTTP' 'Nginx HTTPS'; do
  ufw delete allow "$rule" >/dev/null 2>&1 || true
done

ufw status | grep -E '80|443' | head -n 50
echo "  ✓ 80/443 now Cloudflare-only. Check the site through Cloudflare, then:"
echo "    curl -m 5 -sk https://<origin-ip>/ -H 'Host: api.gocast.fm'   # should time out"
