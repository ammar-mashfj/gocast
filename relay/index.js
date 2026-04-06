require("dotenv").config();
const net = require("net");
const http = require("http");
const { WebSocketServer } = require("ws");

const config = {
  wsPort: parseInt(process.env.WS_PORT || "8080"),
  healthPort: parseInt(process.env.HEALTH_PORT || "8081"),
  icecast: {
    host: process.env.ICECAST_HOST || "localhost",
    port: parseInt(process.env.ICECAST_PORT || "8888"),
    sourcePassword: process.env.ICECAST_SOURCE_PASSWORD || "hackme",
    adminUser: process.env.ICECAST_ADMIN_USER || "admin",
    adminPassword: process.env.ICECAST_ADMIN_PASSWORD || "hackme",
  },
  apiUrl: process.env.API_URL || "http://localhost:8000/api",
};

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

async function validateStreamToken(stationId, token) {
  const res = await fetch(`${config.apiUrl}/internal/validate-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ station_id: stationId, token }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json.valid ? json.station : null;
}

async function updateMetadata(stationId, title, artist) {
  try {
    await fetch(`${config.apiUrl}/internal/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ station_id: stationId, title, artist }),
    });
  } catch (err) {
    log("error", "Failed to update metadata", { stationId, error: err.message });
  }
}

async function updateListenerCount(stationId, count) {
  try {
    await fetch(`${config.apiUrl}/internal/listeners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ station_id: stationId, count }),
    });
  } catch (err) {
    log("error", "Failed to update listener count", { stationId, error: err.message });
  }
}

// --- Icecast source connection ---

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

async function connectToIcecastWithRetry(mount, retries = 5, delayMs = 2000) {
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

  req.end();
}

// --- Listener count polling ---

const activeMounts = new Map(); // mount -> stationId

function startListenerPolling() {
  setInterval(async () => {
    if (activeMounts.size === 0) return;

    try {
      const res = await fetch(`http://${config.icecast.host}:${config.icecast.port}/status-json.xsl`);
      const json = await res.json();

      const sources = json.icestats?.source;
      if (!sources) return;

      const sourceList = Array.isArray(sources) ? sources : [sources];

      for (const [mount, stationId] of activeMounts) {
        const source = sourceList.find((s) => s.listenurl?.includes(mount));
        const count = source ? source.listeners || 0 : 0;
        await updateListenerCount(stationId, count);
      }
    } catch (err) {
      log("error", "Failed to poll Icecast stats", { error: err.message });
    }
  }, 10000);
}

// --- Silence buffer ---
// Minimal valid silent MP3 frame (MPEG1 Layer3, 44100Hz, 128kbps, mono)
// Generated once, reused for all silence streaming
const SILENCE_FRAME = Buffer.from(
  "fffb9004000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000" +
  "000000000000000000000000000000000000000000000000000000000000000000000000",
  "hex",
);
const SILENCE_INTERVAL_MS = 100; // send silence every 100ms
const SILENCE_TIMEOUT_MS = 30000; // keep mount alive for 30s

// Pending mounts waiting for reconnect: mount -> { icecastSocket, silenceTimer, silenceInterval, stationId }
const pendingMounts = new Map();

// --- WebSocket server ---

const wss = new WebSocketServer({ port: config.wsPort });
const AUTH_TIMEOUT_MS = 10000;
const activeConnections = new Map(); // mount -> ws

const KEEPALIVE_TIMEOUT_MS = 5000; // send silence if no audio for 5s

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

      station = await validateStreamToken(msg.stationId, msg.token);
      if (!station) {
        log("warn", "Auth failed", { stationId: msg.stationId });
        ws.close(4003, "Authentication failed");
        return;
      }

      // Check for pending mount (silence streaming after disconnect) — reclaim it
      const pending = pendingMounts.get(station.icecast_mount);
      if (pending && pending.icecastSocket && !pending.icecastSocket.destroyed) {
        log("info", "Reclaiming pending mount", { mount: station.icecast_mount });
        clearTimeout(pending.silenceTimer);
        clearInterval(pending.silenceInterval);
        pendingMounts.delete(station.icecast_mount);
        icecastSocket = pending.icecastSocket;
      } else {
        // Kick previous active connection — close it and wait for its
        // close handler to move the socket to pendingMounts, then reclaim
        const prevWs = activeConnections.get(station.icecast_mount);
        if (prevWs && prevWs.readyState === prevWs.OPEN) {
          log("info", "Kicking previous broadcaster", { mount: station.icecast_mount });
          prevWs.close(4006, "Replaced by new connection");
          // Wait for close handler to fire and move socket to pendingMounts
          await new Promise((r) => setTimeout(r, 500));

          // Now reclaim from pendingMounts
          const moved = pendingMounts.get(station.icecast_mount);
          if (moved && moved.icecastSocket && !moved.icecastSocket.destroyed) {
            log("info", "Reclaiming mount after kick", { mount: station.icecast_mount });
            clearTimeout(moved.silenceTimer);
            clearInterval(moved.silenceInterval);
            pendingMounts.delete(station.icecast_mount);
            icecastSocket = moved.icecastSocket;
          }
        }

        // If we still don't have a socket, connect fresh
        if (!icecastSocket) {
          try {
            icecastSocket = await connectToIcecastWithRetry(station.icecast_mount);
          } catch (err) {
            log("error", "Icecast connection failed", { mount: station.icecast_mount, error: err.message });
            ws.close(4004, "Icecast connection failed");
            return;
          }
        }
      }

      authenticated = true;
      lastAudioTime = Date.now();
      activeMounts.set(station.icecast_mount, station.id);
      activeConnections.set(station.icecast_mount, ws);
      log("info", "Broadcaster connected", { stationId: station.id, mount: station.icecast_mount });

      // Keepalive: send silence to Icecast if no audio arrives for 5s
      keepaliveInterval = setInterval(() => {
        if (icecastSocket && !icecastSocket.destroyed && Date.now() - lastAudioTime > KEEPALIVE_TIMEOUT_MS) {
          icecastSocket.write(SILENCE_FRAME);
        }
      }, 1000);

      ws.send(JSON.stringify({ type: "authenticated", stationId: station.id }));

      // Re-attach listeners (remove old ones from reclaimed sockets)
      icecastSocket.removeAllListeners("close");
      icecastSocket.removeAllListeners("error");

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
      lastMetadata = { title: msg.title || "", artist: msg.artist || "" };
      updateIcecastMetadata(station.icecast_mount, lastMetadata.title, lastMetadata.artist);
      updateMetadata(station.id, lastMetadata.title, lastMetadata.artist);
      log("info", "Metadata updated", { mount: station.icecast_mount, title: msg.title, artist: msg.artist });
      return;
    }

    if (msg.type === "metadata_ping" && authenticated) {
      const pingSong = `PING-${msg.t}`;
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

    if (station) {
      if (activeConnections.get(station.icecast_mount) === ws) {
        activeConnections.delete(station.icecast_mount);
      }
      log("info", "Broadcaster disconnected", { stationId: station.id });

      // Keep Icecast socket alive with silence for 30s, waiting for reconnect
      if (icecastSocket && !icecastSocket.destroyed) {
        log("info", "Streaming silence, waiting for reconnect", { mount: station.icecast_mount });

        const silenceInterval = setInterval(() => {
          if (icecastSocket && !icecastSocket.destroyed) {
            icecastSocket.write(SILENCE_FRAME);
          }
        }, SILENCE_INTERVAL_MS);

        const silenceTimer = setTimeout(async () => {
          clearInterval(silenceInterval);
          const pending = pendingMounts.get(station.icecast_mount);
          if (pending && pending.silenceTimer === silenceTimer) {
            pendingMounts.delete(station.icecast_mount);
            activeMounts.delete(station.icecast_mount);
            if (icecastSocket && !icecastSocket.destroyed) {
              icecastSocket.destroy();
            }
            log("info", "Silence timeout, mount released", { mount: station.icecast_mount });

            try {
              await fetch(`${config.apiUrl}/internal/stream-ended`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ station_id: station.id }),
              });
            } catch (err) {
              log("error", "Failed to notify API of stream end", { stationId: station.id, error: err.message });
            }
          }
        }, SILENCE_TIMEOUT_MS);

        pendingMounts.set(station.icecast_mount, {
          icecastSocket,
          silenceTimer,
          silenceInterval,
          stationId: station.id,
        });
      } else {
        activeMounts.delete(station.icecast_mount);
      }
    } else if (icecastSocket && !icecastSocket.destroyed) {
      icecastSocket.destroy();
    }
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
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(config.healthPort);

// --- Graceful shutdown ---

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

startListenerPolling();
log("info", "Relay started", { wsPort: config.wsPort, healthPort: config.healthPort, icecast: `${config.icecast.host}:${config.icecast.port}` });
