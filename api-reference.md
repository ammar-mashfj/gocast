# GoCast API Reference

Base URL: `http://localhost:8000/api`

All requests must include `Accept: application/json` header.
Protected routes require `Authorization: Bearer {token}` header.

---

## Authentication

### Register
```
POST /api/register
Content-Type: application/json

{
  "name": "string, required, max 255",
  "email": "string, required, valid email, unique",
  "password": "string, required, min 8",
  "password_confirmation": "string, required, must match password"
}

201 Created
{
  "data": { "id", "name", "email", "email_verified_at", "stripe_customer_id", "avatar_url", "created_at", "updated_at" },
  "token": "1|abc123...",
  "message": "Registration successful. Please verify your email."
}

422 Validation Error
{
  "message": "The email has already been taken.",
  "errors": { "email": ["The email has already been taken."] }
}
```

### Login
```
POST /api/login
Content-Type: application/json

{
  "email": "string, required",
  "password": "string, required"
}

200 OK
{
  "data": { "id", "name", "email", "email_verified_at", "stripe_customer_id", "avatar_url", "created_at", "updated_at" },
  "token": "2|xyz789...",
  "message": "Login successful."
}

401 Unauthorized
{ "message": "Invalid credentials." }
```

### Get Authenticated User (protected)
```
GET /api/user

200 OK
{
  "data": { "id", "name", "email", "email_verified_at", "stripe_customer_id", "avatar_url", "created_at", "updated_at" }
}
```

### Logout (protected)
```
POST /api/logout

200 OK
{ "message": "Logged out." }
```

### Resend Verification Email (protected, throttled 6/min)
```
POST /api/email/resend

200 OK
{ "message": "Verification email sent." }
```

---

## Stations (protected)

### List User's Stations
```
GET /api/stations

200 OK
{
  "data": [
    {
      "id": "uuid",
      "user_id": 1,
      "name": "My Radio",
      "slug": "my-radio",
      "description": null,
      "genre": "Electronic",
      "artwork_url": null,
      "plan": "free",
      "is_live": false,
      "icecast_mount": "/stream/my-radio",
      "social_links": null,
      "theme_config": null,
      "created_at": "2026-04-03T19:46:48.000000Z",
      "updated_at": "2026-04-03T19:46:48.000000Z"
    }
  ]
}
```

### Create Station
```
POST /api/stations
Content-Type: application/json

{
  "name": "string, required, max 100",
  "slug": "string, required, max 60, unique, lowercase alphanumeric with hyphens only",
  "description": "string, optional",
  "genre": "string, optional, max 255"
}

201 Created
{ "data": { ...station object } }

403 Forbidden (plan station limit reached)
{ "message": "This action is unauthorized." }

422 Validation Error
{ "message": "...", "errors": { ... } }
```

### Show Station
```
GET /api/stations/{station_uuid}

200 OK
{ "data": { ...station object } }
```

### Update Station
```
PUT /api/stations/{station_uuid}
Content-Type: application/json

{
  "name": "string, optional, max 100",
  "slug": "string, optional, max 60, unique, lowercase alphanumeric with hyphens only",
  "description": "string, optional",
  "genre": "string, optional, max 255",
  "social_links": "object, optional",
  "theme_config": "object, optional"
}

200 OK
{ "data": { ...station object } }
```

### Delete Station
```
DELETE /api/stations/{station_uuid}

200 OK
{ "message": "Station deleted." }
```

### Generate Stream Token (protected)
```
POST /api/stations/{station_uuid}/stream-token

200 OK
{
  "data": {
    "token": "random64chars...",
    "expires_in": 300
  }
}
```

---

## Stream Sessions (protected)

### Start Session (create)
```
POST /api/stations/{station_uuid}/sessions

201 Created
{
  "data": { "id": "uuid", "station_id", "started_at", "ended_at": null, "peak_listeners", "total_listener_minutes", "source_type" },
  "message": "Stream started."
}

409 Conflict (already live)
{ "message": "Station is already live." }
```

### End Session (delete)
```
DELETE /api/stations/{station_uuid}/sessions/{session_uuid}

200 OK
{
  "data": { ...session object with ended_at set },
  "message": "Stream ended."
}
```

### List Sessions
```
GET /api/stations/{station_uuid}/sessions

200 OK (paginated)
{
  "current_page": 1,
  "data": [ ...session objects ],
  "last_page": 1,
  "per_page": 20,
  "total": 1
}
```

---

## Public Endpoints (no auth)

### Get Station by Slug
```
GET /api/public/stations/{slug}

200 OK
{ "data": { ...station object } }

404 Not Found
```

### Get Listener Count
```
GET /api/public/stations/{slug}/listeners

200 OK
{ "data": { "count": 42 } }
```

---

## Internal Endpoints (relay only, no auth)

### Validate Stream Token
```
POST /api/internal/validate-stream
Content-Type: application/json

{
  "station_id": "uuid",
  "token": "string"
}

200 OK
{
  "valid": true,
  "station": { "id", "slug", "icecast_mount", "icecast_password" }
}

401 Unauthorized
{ "valid": false, "message": "Invalid token." }
```

### Update Listener Count
```
POST /api/internal/listeners
Content-Type: application/json

{
  "station_id": "uuid",
  "count": 42
}

200 OK
{ "message": "Listener count updated." }
```

---

## Frontend Integration Notes

- Store the `token` from login/register, send as `Authorization: Bearer {token}` on all protected requests
- Always send `Accept: application/json` header so Laravel returns JSON errors instead of HTML redirects
- 401 response = token invalid/expired, redirect to login
- 422 response = validation errors, field-level errors in `errors` object
- 403 response = unauthorized action (wrong user or plan limit)
- Slug format: lowercase letters, numbers, and hyphens only (regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`)
- Station IDs are UUIDs, user IDs are auto-increment integers
- Plan values: `free`, `starter`, `pro`, `studio`
