# Deployment Note: Auth Cookie Domain

The web client now uses an `HttpOnly` cookie named `token` for authentication.
Laravel sets this cookie after login/register/Google OAuth, and browser API calls
send it back to the API with credentials.

## Production With Shared Parent Domain

If the frontend and API are on subdomains of the same parent domain, set
`SESSION_DOMAIN` to that shared parent domain in the API environment.

Example:

```text
Frontend: https://gocast.fm
API:      https://api.gocast.fm
Admin:    https://admin.gocast.fm
```

Use:

```env
SESSION_DOMAIN=.gocast.fm
```

This lets the browser attach the same `HttpOnly` auth cookie to requests across
`gocast.fm`, `api.gocast.fm`, and other sibling subdomains. JavaScript still
cannot read the token because the cookie is `HttpOnly`.

## Local Development

For local development, keep:

```env
SESSION_DOMAIN=null
```

This lets Laravel use the current host, which is usually the least surprising
behavior for `localhost` setups.

## Failure Mode

If production leaves `SESSION_DOMAIN=null` while the API is served from
`api.gocast.fm`, the browser scopes the auth cookie only to `api.gocast.fm`.
Browser API calls may still work, but the Next.js frontend domain may not see
the cookie during server-side dashboard/proxy checks.

The symptom is usually:

```text
Login succeeds, but dashboard/server-rendered auth checks think the user is logged out.
```

## Different Parent Domains

If the frontend and API are on completely different domains, a shared cookie
domain will not work.

Example:

```text
Frontend: https://gocast.fm
API:      https://gocast-api.fly.dev
```

In that deployment shape, do not use `.gocast.fm` for the API cookie. The auth
flow needs a different deployment/auth strategy, such as serving the API under
the same parent domain or adding a frontend server-side session bridge.
