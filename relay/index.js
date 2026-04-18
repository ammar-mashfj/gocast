/**
 * GoCast Relay Server
 *
 * Thin WebSocket command server that spawns one Liquidsoap process per live
 * station. Liquidsoap handles all audio (file decoding, Ogg/Opus encoding,
 * Icecast output, real-time timing); the relay is pure control plane.
 */

const http = require("http");
const config = require("./src/config");
const log = require("./src/log");
const api = require("./src/api");
const ws = require("./src/ws");
const { startListenerPolling } = require("./src/listeners");

// Start WebSocket server
const wss = ws.start();

// Start listener count polling
startListenerPolling(() => ws.getActiveMounts());

// Health check HTTP server
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    const sessions = ws.getSessions();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      connections: wss.clients.size,
      activeSessions: sessions.size,
      activeMounts: ws.getActiveMounts().size,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(config.healthPort);

// Graceful shutdown
function shutdown() {
  log("info", "Shutting down...");

  // Destroy all sessions (kills ffmpeg processes)
  for (const [, session] of ws.getSessions()) {
    session.destroy();
  }

  wss.clients.forEach((client) => client.close(1001, "Server shutting down"));

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

// Reset stale live stations on startup
api.resetLiveStations();

log("info", "Relay v2 started", {
  wsPort: config.wsPort,
  healthPort: config.healthPort,
  icecast: `${config.icecast.host}:${config.icecast.port}`,
});
