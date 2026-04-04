# Stations & Streaming API Reference

Base URL: `http://localhost:8000/api`
All requests require `Accept: application/json` header.
All endpoints below require `Authorization: Bearer {token}` unless marked as public.

---

## Station Object

```json
{
  "id": "019d54ec-f0b5-73b3-bd89-037544b4e385",
  "user_id": 1,
  "name": "Jazz FM",
  "slug": "jazz-fm",
  "description": "Smooth jazz all day",
  "genre": "Jazz",
  "artwork_url": null,
  "plan": "free",
  "is_live": false,
  "icecast_mount": "/stream/jazz-fm",
  "social_links": null,
  "theme_config": null,
  "created_at": "2026-04-03T19:46:48.000000Z",
  "updated_at": "2026-04-03T19:46:48.000000Z"
}
```

---

## CRUD (protected)

### List User's Stations
```
GET /api/stations

→ 200  { "data": [ ...station objects ] }
```

### Create Station
```
POST /api/stations

Body:
{
  "name": "required, string, max 100",
  "slug": "required, string, max 60, unique, regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/",
  "description": "optional, string",
  "genre": "optional, string, max 255"
}

→ 201  { "data": { ...station } }
→ 403  Station limit reached for current plan
→ 422  { "message": "...", "errors": { "slug": ["..."], ... } }
```

### Show Station
```
GET /api/stations/{uuid}

→ 200  { "data": { ...station } }
→ 403  Not your station
```

### Update Station
```
PUT /api/stations/{uuid}

Body (all fields optional):
{
  "name": "string, max 100",
  "slug": "string, max 60, unique, same regex as create",
  "description": "string",
  "genre": "string, max 255",
  "social_links": {},
  "theme_config": {}
}

→ 200  { "data": { ...station } }
```

### Delete Station
```
DELETE /api/stations/{uuid}

→ 200  { "message": "Station deleted." }
```

---

## Stream Token (protected)

Used by the broadcaster page before connecting to the relay WebSocket.

```
POST /api/stations/{uuid}/stream-token

→ 200
{
  "data": {
    "token": "64-char random string",
    "expires_in": 300
  }
}
```

**Flow:** Frontend calls this → gets token → sends token to relay WebSocket as auth message → relay validates token against API → token is single-use (consumed on validation).

---

## Stream Sessions (protected)

### Start Session
```
POST /api/stations/{uuid}/sessions

→ 201  { "data": { ...session }, "message": "Stream started." }
→ 409  { "message": "Station is already live." }
```

### End Session
```
DELETE /api/stations/{uuid}/sessions/{session_uuid}

→ 200  { "data": { ...session with ended_at set }, "message": "Stream ended." }
```

### List Sessions
```
GET /api/stations/{uuid}/sessions

→ 200  Paginated response
{
  "current_page": 1,
  "data": [
    {
      "id": "uuid",
      "station_id": "uuid",
      "started_at": "2026-04-03T19:50:04.000000Z",
      "ended_at": "2026-04-03T20:30:00.000000Z",
      "peak_listeners": 0,
      "total_listener_minutes": 0,
      "source_type": "browser"
    }
  ],
  "per_page": 20,
  "total": 1
}
```

---

## Public Endpoints (no auth)

### Get Station by Slug
```
GET /api/public/stations/{slug}

→ 200  { "data": { ...station } }
→ 404  Station not found
```

### Get Listener Count
```
GET /api/public/stations/{slug}/listeners

→ 200  { "data": { "count": 42 } }
```

---

## Broadcaster → Relay WebSocket Flow

1. Frontend calls `POST /api/stations/{uuid}/stream-token` → gets `token`
2. Frontend calls `POST /api/stations/{uuid}/sessions` → starts session, gets `session_id`
3. Frontend opens WebSocket to `ws://localhost:8080`
4. Sends auth: `{ "type": "auth", "stationId": "uuid", "token": "token" }`
5. Relay responds: `{ "type": "authenticated", "stationId": "uuid" }`
6. Frontend sends binary MP3 data (audio chunks from lamejs encoder)
7. To update metadata: `{ "type": "metadata", "title": "Song Name", "artist": "Artist" }`
8. On stop: close WebSocket, then call `DELETE /api/stations/{uuid}/sessions/{session_id}`

---

## Plan Limits

Plans are per-station (enum: `free`, `starter`, `pro`, `studio`). New stations default to `free`.

| Plan    | Max Stations | Max Listeners | Max Bitrate | Ads   |
|---------|-------------|---------------|-------------|-------|
| free    | 1           | 30            | 96 kbps     | yes   |
| starter | 2           | 150           | 128 kbps    | no    |
| pro     | 5           | 500           | 320 kbps    | no    |
| studio  | unlimited   | unlimited     | 320 kbps    | no    |

Slug format: lowercase letters, numbers, hyphens only. Regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
