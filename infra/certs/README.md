# Origin certs

For Cloudflare-in-front deployments only. Drop the CF Origin Certificate
pair here:

```
origin.pem   # certificate (paste from CF dashboard)
origin.key   # private key (paste from CF dashboard)
```

Both files are gitignored — do not commit them.

## How the compose uses them

When the api service mounts `Caddyfile.cloudflare` instead of the default
`Caddyfile`, Caddy reads the pair from `/etc/caddy/certs/` (mapped to this
directory). If the files are missing, Caddy refuses to start — which is the
correct failure mode since the alternative is silently serving without TLS.

## Generating new ones

Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate:

- Hostnames: `gocast.fm *.gocast.fm` (wildcard covers `api.`, `www.`, etc.)
- Key type: RSA 2048 or ECC — either works
- Validity: 15 years (there's no reason to pick less)

Copy the displayed cert into `origin.pem` and the key into `origin.key`.
After saving, `chmod 600 origin.key` — Docker mounts it read-only anyway,
but the host-side permissions matter if anyone else logs into the server.
