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

// --- WebSocket server ---

const wss = new WebSocketServer({ port: config.wsPort });
const AUTH_TIMEOUT_MS = 10000;

wss.on("connection", (ws) => {
  let station = null;
  let icecastSocket = null;
  let authenticated = false;
  let lastMetadata = { title: "", artist: "" };

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      log("warn", "Auth timeout, closing connection");
      ws.close(4001, "Authentication timeout");
    }
  }, AUTH_TIMEOUT_MS);

  ws.on("message", async (data) => {
    // Binary data = audio, forward to Icecast
    if (authenticated && Buffer.isBuffer(data)) {
      if (icecastSocket && !icecastSocket.destroyed) {
        icecastSocket.write(data);
      }
      return;
    }

    // Text data = JSON control messages
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
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

      try {
        icecastSocket = await connectToIcecast(station.icecast_mount);
      } catch (err) {
        log("error", "Icecast connection failed", { mount: station.icecast_mount, error: err.message });
        ws.close(4004, "Icecast connection failed");
        return;
      }

      authenticated = true;
      activeMounts.set(station.icecast_mount, station.id);
      log("info", "Broadcaster connected", { stationId: station.id, mount: station.icecast_mount });

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
      lastMetadata = { title: msg.title || "", artist: msg.artist || "" };
      updateIcecastMetadata(station.icecast_mount, lastMetadata.title, lastMetadata.artist);
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

    if (icecastSocket && !icecastSocket.destroyed) {
      icecastSocket.destroy();
    }

    if (station) {
      activeMounts.delete(station.icecast_mount);
      log("info", "Broadcaster disconnected", { stationId: station.id });
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
