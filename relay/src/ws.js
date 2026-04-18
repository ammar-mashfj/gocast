const { WebSocketServer } = require("ws");
const config = require("./config");
const log = require("./log");
const api = require("./api");
const { updateIcecastMetadata } = require("./icecast");
const LiquidsoapSession = require("./liquidsoap");

const AUTH_TIMEOUT_MS = 10000;
const SILENCE_TIMEOUT_MS = 30000;

/** @type {Map<string, LiquidsoapSession>} mount -> active session */
const sessions = new Map();

/** @type {Map<string, string>} mount -> stationId (for listener polling) */
const activeMounts = new Map();

/** @type {Map<string, {silenceTimer: NodeJS.Timeout, stationId: string}>} */
const pendingMounts = new Map();

function start() {
  const wss = new WebSocketServer({
    port: config.wsPort,
    maxPayload: 1024 * 1024,
  });

  wss.on("connection", (ws) => {
    let station = null;
    let authenticated = false;
    /** @type {LiquidsoapSession|null} */
    let session = null;

    const authTimer = setTimeout(() => {
      if (!authenticated) {
        log("warn", "Auth timeout, closing connection");
        ws.close(4001, "Authentication timeout");
      }
    }, AUTH_TIMEOUT_MS);

    ws.on("message", async (data, isBinary) => {
      if (isBinary) return; // Reserved for PTT

      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.close(4002, "Invalid message format");
        return;
      }

      // ── Auth ──
      if (msg.type === "auth" && !authenticated) {
        clearTimeout(authTimer);

        if (!msg.stationId || typeof msg.stationId !== "string" || !msg.token || typeof msg.token !== "string") {
          ws.close(4002, "Invalid auth message");
          return;
        }

        station = await api.validateStreamToken(msg.stationId, msg.token);
        if (!station) {
          ws.close(4003, "Authentication failed");
          return;
        }

        authenticated = true;

        // Check for existing session (browser reconnecting while music is still playing)
        const existingSession = sessions.get(station.icecast_mount);
        if (existingSession) {
          session = existingSession;
          session.addClient(ws);

          const pending = pendingMounts.get(station.icecast_mount);
          if (pending) {
            clearTimeout(pending.silenceTimer);
            pendingMounts.delete(station.icecast_mount);
          }

          log("info", "Broadcaster reconnected to existing session", { stationId: station.id, mount: station.icecast_mount });
          ws.send(JSON.stringify({ type: "authenticated", stationId: station.id }));
          return;
        }

        // Create new session — Liquidsoap connects to Icecast directly
        session = new LiquidsoapSession(station.id, station.icecast_mount);
        session.addClient(ws);
        sessions.set(station.icecast_mount, session);
        activeMounts.set(station.icecast_mount, station.id);

        log("info", "Broadcaster connected, new session", { stationId: station.id, mount: station.icecast_mount });
        ws.send(JSON.stringify({ type: "authenticated", stationId: station.id }));
        return;
      }

      // ── Commands (authenticated only) ──
      if (!authenticated || !session) return;

      try {
        switch (msg.type) {
          case "play":
            await session.play();
            break;

          case "pause":
            await session.pause();
            break;

          case "next":
            await session.next();
            break;

          case "prev":
            await session.prev();
            break;

          case "repeat":
            if (typeof msg.enabled === "boolean") session.setRepeat(msg.enabled);
            break;

          case "queue_set":
            if (Array.isArray(msg.trackIds)) await session.setQueue(msg.trackIds);
            break;

          case "queue_add":
            if (Array.isArray(msg.trackIds)) await session.addTracks(msg.trackIds);
            break;

          case "queue_remove":
            if (typeof msg.trackId === "string") await session.removeTrack(msg.trackId);
            break;

          case "queue_reorder":
            if (typeof msg.from === "number" && typeof msg.to === "number") {
              await session.reorderQueue(msg.from, msg.to);
            }
            break;

          case "metadata":
            if (msg.title || msg.artist) {
              const title = (msg.title || "").slice(0, 255);
              const artist = (msg.artist || "").slice(0, 255);
              updateIcecastMetadata(station.icecast_mount, title, artist);
              api.updateMetadata(station.id, title, artist);
            }
            break;

          case "stop_broadcast":
            log("info", "Broadcaster requested stop", { stationId: station.id });
            cleanupSession(station.icecast_mount);
            api.notifyStreamEnded(station.id);
            session = null;
            authenticated = false;
            break;

          case "ptt_down":
          case "ptt_up":
            break;
        }
      } catch (err) {
        log("error", "Command handler failed", { stationId: station.id, type: msg.type, error: err.message });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (!station || !session) return;

      session.removeClient(ws);
      log("info", "Broadcaster disconnected", { stationId: station.id, clients: session.wsClients.size });

      // If session is playing, keep it alive (autodj)
      // If not playing and no clients, start timeout to release the mount
      if (!session.hasClients() && !session.playing) {
        startDisconnectTimeout(station);
      }
    });

    ws.on("error", (err) => {
      log("error", "WebSocket error", { error: err.message });
    });
  });

  return wss;
}

function startDisconnectTimeout(station) {
  log("info", "No clients and not playing, waiting for reconnect", { mount: station.icecast_mount });

  const silenceTimer = setTimeout(async () => {
    pendingMounts.delete(station.icecast_mount);
    cleanupSession(station.icecast_mount);
    log("info", "Timeout expired, session ended", { mount: station.icecast_mount });
    await api.notifyStreamEnded(station.id);
  }, SILENCE_TIMEOUT_MS);

  pendingMounts.set(station.icecast_mount, {
    silenceTimer,
    stationId: station.id,
  });
}

function cleanupSession(mount) {
  const s = sessions.get(mount);
  if (s) {
    s.destroy();
    sessions.delete(mount);
  }
  activeMounts.delete(mount);
  const pending = pendingMounts.get(mount);
  if (pending) {
    clearTimeout(pending.silenceTimer);
    pendingMounts.delete(mount);
  }
}

function getActiveMounts() {
  return activeMounts;
}

function getSessions() {
  return sessions;
}

module.exports = { start, getActiveMounts, getSessions };
