# Auth Flow

Sanctum cookie-based authentication with Google OAuth and email/password login.
API is at a separate origin from the Next.js SPA, so auth uses a stateless OAuth
state cookie and an HttpOnly `token` cookie carrying the Sanctum plaintext token.

## 1. Google OAuth Login

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant SPA as Next.js SPA<br/>(client/app/auth/login)
    participant POP as OAuth Popup
    participant API as Laravel API
    participant G as Google OAuth

    U->>SPA: Click "Continue with Google"
    SPA->>POP: window.open(API/auth/google)
    POP->>API: GET /auth/google
    Note over API: GoogleAuthController::redirect<br/>generates state, sha256-hashes it,<br/>stores hash in HttpOnly cookie<br/>"gocast_oauth_state" (10min TTL)
    API->>G: 302 redirect to consent screen<br/>(Socialite::stateless)
    G->>U: Show consent screen
    U->>G: Approve
    G->>POP: 302 /auth/google/callback?code&state
    POP->>API: GET /auth/google/callback
    Note over API: GoogleAuthController::callback<br/>1. hash_equals(state, cookie hash)<br/>2. Socialite → Google user<br/>3. Find by google_id → email → create<br/>4. Mark email verified, fire Verified<br/>5. createToken('auth')->plainTextToken<br/>6. Set HttpOnly "token" cookie
    API-->>POP: HTML (google-callback.blade.php)
    POP->>SPA: postMessage({authenticated:true})<br/>targetOrigin = frontend_url
    POP->>POP: window.close()
    SPA->>API: GET /api/user (credentials: include)
    Note over API: UseAuthTokenCookie middleware<br/>cookie → Authorization: Bearer<br/>then auth:sanctum validates
    API-->>SPA: 200 { user }
    SPA->>SPA: saveAuth() → non-HttpOnly "user" cookie
    SPA->>U: Redirect /dashboard
```

## 2. Password Login

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant SPA as Next.js SPA
    participant API as Laravel API

    U->>SPA: Submit email + password
    SPA->>API: POST /auth/login (credentials: include)
    Note over API: AuthController::login<br/>validate → Auth::attempt<br/>createToken('auth')
    API-->>SPA: 200 { user } + Set-Cookie: token (HttpOnly)
    alt email_verified_at is null
        SPA->>U: Show verify-email modal
    else verified
        SPA->>SPA: saveAuth() → "user" cookie
        SPA->>U: Redirect /dashboard
    end
```

## 3. Authenticated API Request (middleware chain)

```mermaid
flowchart TD
    A[Browser request to /api/*] -->|Cookie: token=...| B[UseAuthTokenCookie middleware]
    B --> C{Has Authorization<br/>Bearer header?}
    C -->|No| D[Copy token cookie<br/>into Bearer header]
    C -->|Yes| E[Pass through]
    D --> F[auth:sanctum]
    E --> F
    F --> G{Token valid in<br/>personal_access_tokens?}
    G -->|No| H[401 Unauthenticated]
    G -->|Yes| I{Route uses<br/>verified middleware?}
    I -->|No| K[Controller runs]
    I -->|Yes| J{email_verified_at<br/>set?}
    J -->|No| L[403 code: email_unverified]
    J -->|Yes| K
```

## 4. Logout

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant SPA as Next.js SPA
    participant API as Laravel API

    U->>SPA: Click logout
    SPA->>API: POST /api/logout (Bearer via cookie)
    Note over API: AuthController::logout<br/>currentAccessToken()->delete()<br/>forgetAuthCookie()
    API-->>SPA: 204 + Set-Cookie: token=; Max-Age=0
    SPA->>SPA: clearAuth() — remove "user" cookie
    SPA->>U: Redirect /auth/login
```

## Notes

- **Dual-cookie strategy**: HttpOnly `token` (security, not JS-readable) + non-HttpOnly `user` (instant UI state, no API roundtrip on page load).
- **Cross-domain OAuth**: `Socialite::stateless()` + signed state cookie — no server session.
- **Email verification**: auto-verified on Google login; required before accessing `verified`-gated routes for password accounts.
- **Account linking**: Google callback links `google_id` onto an existing email-matched account if found.
- See also: [deployment-auth-cookies.md](./deployment-auth-cookies.md) for `SESSION_DOMAIN` setup across subdomains.
