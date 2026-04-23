/**
 * GoCast WebSocket Relay Server
 *
 * Sits between browser-based broadcasters and Icecast. Broadcasters connect
 * via WebSocket, authenticate with a one-time token verified against the
 * Laravel API, and stream MP3 audio which is proxied to an Icecast SOURCE
 * mount over raw TCP. Also handles metadata updates (pushed to both Icecast
 * and the API) and polls Icecast for per-mount listener counts.
 *
 * Disconnect handling: when a broadcaster's WebSocket closes, the SOURCE is
 * released immediately. Icecast is configured with <fallback-mount> pointing
 * at an always-on standby stream, so listeners are transparently routed to
 * the standby bed without reconnecting. A 30s grace timer is started — if
 * the broadcaster reconnects inside the window, playback resumes seamlessly;
 * otherwise the API is notified the session has ended.
 */

require("dotenv").config();
const net = require("net");
const http = require("http");
const { WebSocketServer } = require("ws");

function requiredEnv(name, forbiddenValues = []) {
  const value = process.env[name];
  if (!value || forbiddenValues.includes(value)) {
    console.error(JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      msg: "Missing or unsafe required environment variable",
      name,
    }));
    process.exit(1);
  }

  return value;
}

// Environment-driven configuration for ports, Icecast credentials, and API URL
const config = {
  wsPort: parseInt(process.env.WS_PORT || "8080"),
  healthPort: parseInt(process.env.HEALTH_PORT || "8081"),
  icecast: {
    host: process.env.ICECAST_HOST || "localhost",
    port: parseInt(process.env.ICECAST_PORT || "8888"),
    sourcePassword: requiredEnv("ICECAST_SOURCE_PASSWORD", ["hackme"]),
    adminUser: process.env.ICECAST_ADMIN_USER || "admin",
    adminPassword: requiredEnv("ICECAST_ADMIN_PASSWORD", ["hackme"]),
  },
  apiUrl: process.env.API_URL || "http://localhost:8000/api",
  internalApiKey: requiredEnv("INTERNAL_API_KEY"),
};

/**
 * Structured JSON logger for production observability.
 * @param {"info"|"warn"|"error"} level - Log severity
 * @param {string} msg - Human-readable message
 * @param {Object} [data] - Additional key-value pairs merged into the log entry
 */
function log(level, msg, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

// --- API client ---

/**
 * Authenticates a broadcaster by exchanging their one-time stream token
 * with the Laravel API. Returns the station object (including Icecast
 * mount credentials) on success, or null if the token is invalid/expired.
 * @param {number} stationId
 * @param {string} token - One-time token issued when the broadcaster clicks "Go Live"
 * @returns {Promise<Object|null>} Station object with icecast_mount, or null
 */
async function validateStreamToken(stationId, token) {
  const res = await fetch(`${config.apiUrl}/internal/validate-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Internal-Key": config.internalApiKey },
    body: JSON.stringify({ station_id: stationId, token }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json.valid ? json.station : null;
}

/**
 * Notifies the API of track metadata changes so the frontend can display
 * the current title and artist in real time.
 * @param {number} stationId
 * @param {string} title
 * @param {string} artist
 */
async function updateMetadata(stationId, title, artist) {
  try {
    await fetch(`${config.apiUrl}/internal/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Internal-Key": config.internalApiKey },
      body: JSON.stringify({ station_id: stationId, title, artist }),
    });
  } catch (err) {
    log("error", "Failed to update metadata", { stationId, error: err.message });
  }
}

/**
 * Reports current listener count to the API for real-time display on
 * the broadcaster dashboard and public station pages.
 * @param {number} stationId
 * @param {number} count
 */
async function updateListenerCount(stationId, count) {
  try {
    await fetch(`${config.apiUrl}/internal/listeners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Internal-Key": config.internalApiKey },
      body: JSON.stringify({ station_id: stationId, count }),
    });
  } catch (err) {
    log("error", "Failed to update listener count", { stationId, error: err.message });
  }
}

// --- Icecast source connection ---

/**
 * Opens a raw TCP SOURCE connection to Icecast using the HTTP/1.0 SOURCE
 * protocol. Resolves with the connected socket on "200 OK", rejects on
 * error, rejection response, or 5s timeout.
 * @param {string} mount - Icecast mount path (e.g. "/live-abc123")
 * @returns {Promise<net.Socket>} Connected TCP socket ready for audio data
 */
function connectToIcecast(mount) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(config.icecast.port, config.icecast.host, () => {
      const headers = [
        `SOURCE ${mount} HTTP/1.0`,
        `Authorization: Basic ${Buffer.from(`source:${config.icecast.sourcePassword}`).toString("base64")}`,
        "Content-Type: audio/mpeg",
        `User-Agent: GoCast-Relay/1.0`,
        "",
        "",
      ].join("\r\n");

      socket.write(headers);
    });

    let responseBuffer = "";
    let resolved = false;

    socket.once("data", (data) => {
      responseBuffer += data.toString();
      if (responseBuffer.includes("200 OK")) {
        resolved = true;
        resolve(socket);
      } else {
        resolved = true;
        socket.destroy();
        reject(new Error(`Icecast rejected connection: ${responseBuffer.trim()}`));
      }
    });

    socket.on("error", (err) => {
      if (!resolved) reject(err);
    });

    socket.setTimeout(5000, () => {
      if (!resolved) {
        socket.destroy();
        reject(new Error("Icecast connection timeout"));
      }
    });
  });
}

/**
 * Wraps connectToIcecast with retry logic for "Mountpoint in use" errors.
 * This now only surfaces during the brief window after an old SOURCE socket
 * closes and before Icecast has fully released the mount — e.g. when a
 * second broadcaster tab for the same station races the first one's close.
 * @param {string} mount
 * @param {number} [retries=3]
 * @param {number} [delayMs=500]
 * @returns {Promise<net.Socket>}
 */
async function connectToIcecastWithRetry(mount, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await connectToIcecast(mount);
    } catch (err) {
      if (err.message.includes("Mountpoint in use") && attempt < retries) {
        log("warn", `Mount in use, retrying in ${delayMs}ms (attempt ${attempt}/${retries})`, { mount });
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Updates the "now playing" song info on the Icecast mount via the admin
 * metadata API. Fire-and-forget — errors are logged but not propagated.
 * @param {string} mount
 * @param {string} title
 * @param {string} artist
 */
function updateIcecastMetadata(mount, title, artist) {
  const song = artist ? `${artist} - ${title}` : title;
  const path = `/admin/metadata?mount=${encodeURIComponent(mount)}&mode=updinfo&song=${encodeURIComponent(song)}`;
  const auth = Buffer.from(`${config.icecast.adminUser}:${config.icecast.adminPassword}`).toString("base64");

  const req = http.request({
    hostname: config.icecast.host,
    port: config.icecast.port,
    path,
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });

  req.on("error", (err) => {
    log("error", "Failed to update metadata", { mount, error: err.message });
  });

  req.setTimeout(5000, () => {
    req.destroy();
    log("error", "Icecast metadata request timed out", { mount });
  });

  req.end();
}

// --- Listener count polling ---

const activeMounts = new Map(); // mount -> stationId

/**
 * Polls Icecast stats every 10 seconds and reports per-mount listener
 * counts to the API. Only queries when there are active mounts.
 */
function startListenerPolling() {
  setInterval(async () => {
    if (activeMounts.size === 0) return;

    try {
      const res = await fetch(`http://${config.icecast.host}:${config.icecast.port}/status-json.xsl`);
      const json = await res.json();

      const sources = json.icestats?.source;
      if (!sources) return;

      const sourceList = Array.isArray(sources) ? sources : [sources];

      // Index sources by URL pathname so /stream/foo doesn't match /stream/foo-2
      // (substring matching on listenurl conflates similar slugs).
      const byPath = new Map();
      for (const s of sourceList) {
        if (!s.listenurl) continue;
        try {
          byPath.set(new URL(s.listenurl).pathname, s);
        } catch { /* malformed listenurl — skip */ }
      }

      for (const [mount, stationId] of activeMounts) {
        const source = byPath.get(mount);
        const count = source ? source.listeners || 0 : 0;
        await updateListenerCount(stationId, count);
      }
    } catch (err) {
      log("error", "Failed to poll Icecast stats", { error: err.message });
    }
  }, 10000);
}

// --- Keepalive silence frame ---
// Minimal valid silent MP3 frame (MPEG1 Layer3, 44100Hz, 128kbps, mono).
// Written to Icecast if the broadcaster's own audio pipeline goes silent for
// more than KEEPALIVE_TIMEOUT_MS, to keep Icecast's <source-timeout> from
// tearing down the primary mount during a DJ pause. This is about SOURCE
// liveness only; disconnect-time silence is handled by Icecast's
// <fallback-mount>, not by the relay.
const KEEPALIVE_FRAME = Buffer.from(
  "fffb9004000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "000000000000000000000000000000000000000000000000000000000000000000000000",
  "hex",
);
const KEEPALIVE_TIMEOUT_MS = 5000; // write a keepalive frame if no broadcaster audio for 5s

// After a broadcaster's WebSocket closes, give them 30s to reconnect before
// calling the API to mark the session ended. Listener routing during this
// window is handled by Icecast's fallback-mount, independent of this timer.
const SESSION_END_GRACE_MS = 30000;

// mount -> { timer, stationId } — pending "session ended" API calls that
// get cancelled when the broadcaster reconnects within the grace window.
const pendingSessionEnds = new Map();

// --- WebSocket server ---

const wss = new WebSocketServer({
  port: config.wsPort,
  maxPayload: 1024 * 1024, // 1MB — prevents memory exhaustion from oversized messages
});
const AUTH_TIMEOUT_MS = 10000;
const activeConnections = new Map(); // mount -> ws

/*
 * WebSocket connection lifecycle:
 *  1. Client connects — a 10s auth timer starts.
 *  2. Client sends { type: "auth", stationId, token }. Token is validated
 *     against the API. Any pending session-end timer for this mount is
 *     cancelled. If a previous broadcaster holds the mount, its WS is kicked
 *     and a fresh Icecast SOURCE is opened (retry handles the brief
 *     mount-in-use window as the old SOURCE closes).
 *  3. Binary frames from the client are forwarded directly to Icecast.
 *  4. JSON { type: "metadata" } messages update both Icecast and the API.
 *  5. On disconnect, the Icecast SOURCE is released immediately; Icecast's
 *     <fallback-mount> routes listeners to the standby stream. A 30s grace
 *     timer fires the session-ended API call unless the broadcaster
 *     reconnects first.
 */
wss.on("connection", (ws) => {
  let station = null;
  let icecastSocket = null;
  let authenticated = false;
  let lastMetadata = { title: "", artist: "" };
  let lastAudioTime = 0;
  let keepaliveInterval = null;

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      log("warn", "Auth timeout, closing connection");
      ws.close(4001, "Authentication timeout");
    }
  }, AUTH_TIMEOUT_MS);

  ws.on("message", async (data, isBinary) => {
    // Binary data = audio, forward to Icecast (or ignore if not yet authenticated)
    if (isBinary) {
      if (authenticated && icecastSocket && !icecastSocket.destroyed) {
        icecastSocket.write(data);
        lastAudioTime = Date.now();
      }
      return;
    }

    // Text data = JSON control messages
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      log("warn", "Invalid message received", { isBinary, authenticated, dataLength: data.length, preview: data.toString().substring(0, 100) });
      ws.close(4002, "Invalid message format");
      return;
    }

    if (msg.type === "auth" && !authenticated) {
      clearTimeout(authTimer);

      if (!msg.stationId || typeof msg.stationId !== "string" || !msg.token || typeof msg.token !== "string") {
        log("warn", "Invalid auth message", { stationId: msg.stationId });
        ws.close(4002, "Invalid auth message");
        return;
      }

      station = await validateStreamToken(msg.stationId, msg.token);
      if (!station) {
        log("warn", "Auth failed", { stationId: msg.stationId });
        ws.close(4003, "Authentication failed");
        return;
      }

      // Broadcaster is back within the grace window — cancel pending session-end.
      const pending = pendingSessionEnds.get(station.icecast_mount);
      if (pending) {
        log("info", "Cancelling pending session-end (broadcaster reconnected)", { mount: station.icecast_mount });
        clearTimeout(pending.timer);
        pendingSessionEnds.delete(station.icecast_mount);
      }

      // Kick a previous live WS on the same mount (e.g. second tab). Flag
      // the old ws so its close handler doesn't schedule its own session-end
      // timer — this is a replacement, not a real disconnect.
      const prevWs = activeConnections.get(station.icecast_mount);
      if (prevWs && prevWs.readyState === prevWs.OPEN) {
        log("info", "Kicking previous broadcaster", { mount: station.icecast_mount });
        prevWs._replaced = true;
        prevWs.close(4006, "Replaced by new connection");
      }

      try {
        icecastSocket = await connectToIcecastWithRetry(station.icecast_mount);
      } catch (err) {
        log("error", "Icecast connection failed", { mount: station.icecast_mount, error: err.message });
        ws.close(4004, "Icecast connection failed");
        return;
      }

      authenticated = true;
      lastAudioTime = Date.now();
      activeMounts.set(station.icecast_mount, station.id);
      activeConnections.set(station.icecast_mount, ws);
      log("info", "Broadcaster connected", { stationId: station.id, mount: station.icecast_mount });

      // Keep the SOURCE alive if the broadcaster's own audio stalls (e.g.
      // DJ paused between tracks) so Icecast doesn't hit <source-timeout>.
      keepaliveInterval = setInterval(() => {
        if (icecastSocket && !icecastSocket.destroyed && Date.now() - lastAudioTime > KEEPALIVE_TIMEOUT_MS) {
          icecastSocket.write(KEEPALIVE_FRAME);
        }
      }, 1000);

      ws.send(JSON.stringify({ type: "authenticated", stationId: station.id }));

      icecastSocket.on("close", () => {
        log("info", "Icecast connection closed", { mount: station.icecast_mount });
        if (ws.readyState === ws.OPEN) {
          ws.close(4005, "Icecast connection lost");
        }
      });

      icecastSocket.on("error", (err) => {
        log("error", "Icecast socket error", { mount: station.icecast_mount, error: err.message });
      });

      return;
    }

    if (msg.type === "metadata" && authenticated) {
      // Validate metadata length to prevent abuse
      const title = (msg.title || "").slice(0, 255);
      const artist = (msg.artist || "").slice(0, 255);
      lastMetadata = { title, artist };
      updateIcecastMetadata(station.icecast_mount, title, artist);
      updateMetadata(station.id, title, artist);
      log("info", "Metadata updated", { mount: station.icecast_mount, title, artist });
      return;
    }

    if (msg.type === "metadata_ping" && authenticated) {
      // Validate metadata length to prevent abuse
      const pingT = (String(msg.t || "")).slice(0, 255);
      const pingSong = `PING-${pingT}`;
      updateIcecastMetadata(station.icecast_mount, pingSong, "");

      // Revert to real metadata after 2s so listeners never see the ping
      setTimeout(() => {
        updateIcecastMetadata(station.icecast_mount, lastMetadata.title, lastMetadata.artist);
      }, 2000);
      return;
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    if (keepaliveInterval) clearInterval(keepaliveInterval);

    // Release the Icecast SOURCE immediately. Icecast's <fallback-mount>
    // transparently moves any attached listeners to the standby stream.
    if (icecastSocket && !icecastSocket.destroyed) {
      icecastSocket.destroy();
    }

    if (!station) return;

    if (activeConnections.get(station.icecast_mount) === ws) {
      activeConnections.delete(station.icecast_mount);
    }

    if (ws._replaced) {
      // A new broadcaster is taking over this mount; its auth path is
      // responsible for the mount lifecycle. Do not schedule a session-end.
      log("info", "Broadcaster replaced by new connection", { stationId: station.id, mount: station.icecast_mount });
      return;
    }

    log("info", "Broadcaster disconnected, starting session-end grace", {
      stationId: station.id,
      mount: station.icecast_mount,
      graceMs: SESSION_END_GRACE_MS,
    });

    // Replace any prior pending timer (e.g. double-disconnect noise) with a fresh one.
    const prior = pendingSessionEnds.get(station.icecast_mount);
    if (prior) clearTimeout(prior.timer);

    const timer = setTimeout(async () => {
      pendingSessionEnds.delete(station.icecast_mount);
      activeMounts.delete(station.icecast_mount);
      log("info", "Session grace expired, notifying API", { mount: station.icecast_mount });
      try {
        await fetch(`${config.apiUrl}/internal/stream-ended`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "X-Internal-Key": config.internalApiKey },
          body: JSON.stringify({ station_id: station.id }),
        });
      } catch (err) {
        log("error", "Failed to notify API of stream end", { stationId: station.id, error: err.message });
      }
    }, SESSION_END_GRACE_MS);

    pendingSessionEnds.set(station.icecast_mount, { timer, stationId: station.id });
  });

  ws.on("error", (err) => {
    log("error", "WebSocket error", { error: err.message });
  });
});

// --- Health check ---

const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      connections: wss.clients.size,
      activeMounts: activeMounts.size,
    }));
  } else if (req.url === "/stations") {
    // Station IDs the relay currently considers live — includes mounts in
    // the 30s session-end grace window so the API doesn't kill them mid-reconnect.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ stations: Array.from(activeMounts.values()) }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(config.healthPort);

// --- Graceful shutdown ---

/**
 * Graceful shutdown — closes all WebSocket clients with a 1001 code,
 * then shuts down the WS and health HTTP servers. Forces exit after 5s
 * if something hangs.
 */
function shutdown() {
  log("info", "Shutting down...");

  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));

  wss.close(() => {
    healthServer.close(() => {
      log("info", "Shutdown complete");
      process.exit(0);
    });
  });

  setTimeout(() => {
    log("warn", "Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// --- Start ---

/**
 * Called on startup to mark all stations as offline via the API, cleaning
 * up any stale "is_live" state left over from a previous crash or restart.
 */
async function resetLiveStations() {
  try {
    const res = await fetch(`${config.apiUrl}/internal/reset-live`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Internal-Key": config.internalApiKey },
    });
    const json = await res.json();
    log("info", "Reset stale live stations", { count: json.count });
  } catch (err) {
    log("error", "Failed to reset live stations", { error: err.message });
  }
}

resetLiveStations();
startListenerPolling();
log("info", "Relay started", { wsPort: config.wsPort, healthPort: config.healthPort, icecast: `${config.icecast.host}:${config.icecast.port}` });
