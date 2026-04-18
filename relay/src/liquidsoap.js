const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const log = require("./log");
const api = require("./api");
const { updateIcecastMetadata } = require("./icecast");

const TEMPLATE_PATH = path.join(__dirname, "liquidsoap-template.liq");
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, "utf8");

const RUNTIME_DIR = "/tmp";
const POLL_MS = 500;
const SOCKET_WAIT_MS = 10000;
const CMD_TIMEOUT_MS = 5000;

/**
 * One Liquidsoap process per live station. Handles queue, playback,
 * and metadata over a Unix control socket. Public API mirrors the old
 * StationSession so ws.js doesn't care about the engine swap.
 */
class LiquidsoapSession {
  constructor(stationId, mount) {
    this.stationId = stationId;
    this.mount = mount;
    this.configPath = path.join(RUNTIME_DIR, `gocast-${stationId}.liq`);
    this.socketPath = path.join(RUNTIME_DIR, `gocast-${stationId}.sock`);

    /** @type {Array<{id:string,title:string,artist:string,duration:number,filePath:string}>} */
    this.queue = [];
    this.currentIndex = -1;
    this.playing = false;
    this.repeat = true;
    this.elapsed = 0;

    /** RIDs currently pushed to Liquidsoap, ordered: [current, next, ...]. */
    this.pushedRids = [];
    /** rid -> trackIndex in this.queue */
    this.ridToIndex = new Map();

    /** @type {Set<import("ws").WebSocket>} */
    this.wsClients = new Set();

    this.proc = null;
    this.socket = null;
    this.ready = false;
    this.stopping = false;

    this.responseBuffer = "";
    this.pendingResolve = null;
    this.commandChain = Promise.resolve();

    /** Last track id we pushed metadata for — avoids flooding API/Icecast per poll. */
    this.lastMetadataTrackId = null;

    this.init().catch((err) => {
      log("error", "Liquidsoap init failed", { stationId, mount, error: err.message });
      this.destroy();
    });

    log("info", "Liquidsoap session created", { stationId, mount });
  }

  // ── Lifecycle ──

  async init() {
    this.renderConfig();
    try { fs.unlinkSync(this.socketPath); } catch {}
    this.spawnProcess();
    await this.waitForSocket();
    await this.openSocket();
    this.ready = true;
    this.pollInterval = setInterval(() => this.poll().catch(() => {}), POLL_MS);
    this.broadcastState();
  }

  renderConfig() {
    const rendered = TEMPLATE
      .replace(/__SOCKET_PATH__/g, this.socketPath)
      .replace(/__ICECAST_HOST__/g, config.icecast.host)
      .replace(/__ICECAST_PORT__/g, String(config.icecast.port))
      .replace(/__ICECAST_PASSWORD__/g, config.icecast.sourcePassword)
      .replace(/__MOUNT__/g, this.mount)
      .replace(/__STATION_NAME__/g, `GoCast ${this.stationId}`);
    fs.writeFileSync(this.configPath, rendered);
  }

  spawnProcess() {
    this.proc = spawn("liquidsoap", [this.configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const pipeLog = (data) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) log("info", "liquidsoap", { stationId: this.stationId, line: trimmed });
      }
    };
    this.proc.stdout.on("data", pipeLog);
    this.proc.stderr.on("data", pipeLog);

    this.proc.on("close", (code) => {
      log("warn", "Liquidsoap exited", { stationId: this.stationId, code });
      this.proc = null;
      if (!this.stopping) this.destroy();
    });
  }

  async waitForSocket() {
    const deadline = Date.now() + SOCKET_WAIT_MS;
    while (Date.now() < deadline) {
      if (fs.existsSync(this.socketPath)) return;
      await sleep(100);
    }
    throw new Error("Liquidsoap control socket did not appear");
  }

  openSocket() {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection(this.socketPath);
      sock.setEncoding("utf8");
      sock.once("connect", () => {
        this.socket = sock;
        sock.on("data", (chunk) => this.onSocketData(chunk));
        sock.on("close", () => {
          this.socket = null;
          if (!this.stopping) log("warn", "Liquidsoap socket closed", { stationId: this.stationId });
        });
        sock.on("error", (err) => log("error", "Liquidsoap socket error", { error: err.message }));
        resolve();
      });
      sock.once("error", reject);
    });
  }

  // ── Telnet-style protocol ──

  onSocketData(chunk) {
    this.responseBuffer += chunk;
    // Response terminator is a line containing exactly "END" followed by \r\n or \n.
    const match = this.responseBuffer.match(/(?:^|\r?\n)END\r?\n/);
    if (!match) return;
    const end = match.index + match[0].length;
    const body = this.responseBuffer.slice(0, match.index);
    this.responseBuffer = this.responseBuffer.slice(end);
    const lines = body.split(/\r?\n/).filter((l) => l.length > 0);
    if (this.pendingResolve) {
      const r = this.pendingResolve;
      this.pendingResolve = null;
      r(lines);
    }
  }

  cmd(command) {
    this.commandChain = this.commandChain.then(() => new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket not open"));
      this.pendingResolve = resolve;
      const timer = setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error(`Liquidsoap command timeout: ${command}`));
        }
      }, CMD_TIMEOUT_MS);
      const wrapped = (lines) => { clearTimeout(timer); resolve(lines); };
      this.pendingResolve = wrapped;
      this.socket.write(command + "\n");
    }));
    return this.commandChain;
  }

  // ── Queue management ──

  async setQueue(trackIds) {
    const tracks = await resolveTracks(trackIds);
    this.queue = tracks;
    this.currentIndex = tracks.length > 0 ? 0 : -1;
    this.elapsed = 0;
    await this.flushLiquidsoapQueue();
    if (tracks.length > 0) {
      this.playing = true;
      await this.cmd("resume");
      await this.pushLookahead();
    } else {
      this.playing = false;
    }
    this.broadcastState();
  }

  async addTracks(trackIds) {
    const tracks = await resolveTracks(trackIds);
    const wasEmpty = this.queue.length === 0;
    this.queue.push(...tracks);
    if (wasEmpty && tracks.length > 0) {
      this.currentIndex = 0;
      this.playing = true;
      await this.cmd("resume");
    }
    await this.pushLookahead();
    this.broadcastState();
  }

  async removeTrack(trackId) {
    const idx = this.queue.findIndex((t) => t.id === trackId);
    if (idx === -1) return;

    if (idx === this.currentIndex) {
      this.queue.splice(idx, 1);
      if (this.queue.length === 0) {
        this.currentIndex = -1;
        this.playing = false;
        this.elapsed = 0;
        await this.flushLiquidsoapQueue();
      } else {
        this.currentIndex = Math.min(idx, this.queue.length - 1);
        this.elapsed = 0;
        await this.flushLiquidsoapQueue();
        await this.pushLookahead();
      }
    } else {
      this.queue.splice(idx, 1);
      if (idx < this.currentIndex) this.currentIndex--;
      await this.rebuildLookahead();
    }
    this.broadcastState();
  }

  async reorderQueue(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;

    const [moved] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, moved);

    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }
    await this.rebuildLookahead();
    this.broadcastState();
  }

  // ── Playback controls ──

  async play() {
    if (this.queue.length === 0) return;
    if (this.currentIndex === -1) this.currentIndex = 0;
    await this.cmd("resume");
    if (this.pushedRids.length === 0) await this.pushLookahead();
    this.playing = true;
    this.broadcastState();
  }

  async pause() {
    await this.cmd("pause");
    this.playing = false;
    this.broadcastState();
  }

  async next() {
    if (this.queue.length === 0) return;
    const hasNext = this.currentIndex + 1 < this.queue.length;
    if (hasNext) {
      await this.cmd("q.skip").catch(() => {});
    } else if (this.repeat) {
      this.currentIndex = 0;
      this.elapsed = 0;
      await this.flushLiquidsoapQueue();
      await this.pushLookahead();
    } else {
      this.currentIndex = -1;
      this.playing = false;
      this.elapsed = 0;
      await this.flushLiquidsoapQueue();
    }
    this.broadcastState();
  }

  async prev() {
    if (this.queue.length === 0) return;
    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else if (this.repeat) {
      this.currentIndex = this.queue.length - 1;
    } else {
      this.currentIndex = 0;
    }
    this.elapsed = 0;
    await this.flushLiquidsoapQueue();
    await this.pushLookahead();
    this.broadcastState();
  }

  setRepeat(enabled) {
    this.repeat = enabled;
    this.broadcastState();
  }

  getElapsed() {
    return this.elapsed;
  }

  // ── Liquidsoap queue sync ──

  async flushLiquidsoapQueue() {
    // Destroy any lookahead entries that haven't started yet.
    const pending = this.pushedRids.slice(1);
    for (const rid of pending) {
      await this.cmd(`request.destroy ${rid}`).catch(() => {});
      this.ridToIndex.delete(rid);
    }
    // Skip the currently-playing track, if any.
    if (this.pushedRids.length > 0) {
      await this.cmd("q.flush_and_skip").catch(() => {});
    }
    for (const rid of this.pushedRids) this.ridToIndex.delete(rid);
    this.pushedRids = [];
  }

  async pushLookahead() {
    const LOOKAHEAD = 2; // current + 1 (gapless transition)
    while (this.pushedRids.length < LOOKAHEAD) {
      const idx = this.currentIndex + this.pushedRids.length;
      if (idx < 0 || idx >= this.queue.length) break;
      const track = this.queue[idx];
      const uri = annotateUri(track);
      const resp = await this.cmd(`q.push ${uri}`).catch((err) => {
        log("error", "q.push failed", { error: err.message, trackId: track.id });
        return null;
      });
      if (!resp) break;
      const rid = resp[0]?.trim();
      if (!rid || rid === "(undef)") {
        log("error", "q.push returned no RID", { trackId: track.id });
        break;
      }
      this.pushedRids.push(rid);
      this.ridToIndex.set(rid, idx);
    }
  }

  async rebuildLookahead() {
    // Keep the currently-playing RID, drop future pushes, then re-push.
    const playing = this.pushedRids[0];
    const stale = this.pushedRids.slice(1);
    for (const rid of stale) {
      await this.cmd(`request.destroy ${rid}`).catch(() => {});
      this.ridToIndex.delete(rid);
    }
    this.pushedRids = playing ? [playing] : [];
    await this.pushLookahead();
  }

  // ── State polling ──

  async poll() {
    if (!this.ready || this.stopping || !this.socket) return;

    const onAir = await this.cmd("request.on_air").catch(() => []);
    const airRid = (onAir[0] || "").trim().split(/\s+/)[0] || null;

    // Handle track transitions within our lookahead.
    if (airRid && this.pushedRids.length > 0 && airRid !== this.pushedRids[0]) {
      const finished = this.pushedRids.shift();
      this.ridToIndex.delete(finished);
      const idx = this.ridToIndex.get(airRid);
      this.currentIndex = typeof idx === "number" ? idx : this.currentIndex + 1;
      this.elapsed = 0;
      await this.pushLookahead();
      this.broadcastState();
    }

    // Queue ran dry while user intended playback — apply repeat or stop.
    if (!airRid && this.playing && this.pushedRids.length === 0) {
      if (this.repeat && this.queue.length > 0) {
        this.currentIndex = 0;
        this.elapsed = 0;
        await this.pushLookahead();
      } else {
        this.playing = false;
        this.currentIndex = this.queue.length > 0 ? this.currentIndex : -1;
        this.elapsed = 0;
      }
      this.broadcastState();
      return;
    }

    // Update elapsed from remaining time on the output.
    if (airRid && this.playing && this.currentIndex >= 0) {
      const rem = await this.cmd("out.remaining").catch(() => []);
      const remSec = parseFloat(rem[0]);
      const track = this.queue[this.currentIndex];
      if (track && !isNaN(remSec)) {
        this.elapsed = Math.max(0, track.duration - remSec);
      }
    }

    this.broadcastState();
  }

  // ── WS client management ──

  addClient(ws) {
    this.wsClients.add(ws);
    this.sendTo(ws, { type: "state", ...this.getStatePayload() });
  }

  removeClient(ws) { this.wsClients.delete(ws); }
  hasClients() { return this.wsClients.size > 0; }

  // ── State broadcast ──

  getStatePayload() {
    const track = this.queue[this.currentIndex] ?? null;
    return {
      playing: this.playing,
      currentTrackId: track?.id ?? null,
      currentIndex: this.currentIndex,
      elapsed: this.elapsed,
      duration: track?.duration ?? 0,
      repeat: this.repeat,
      queue: this.queue.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
      })),
    };
  }

  broadcastState() {
    if (!this.ready && this.queue.length === 0) return;
    const msg = JSON.stringify({ type: "state", ...this.getStatePayload() });
    for (const ws of this.wsClients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }

    const track = this.queue[this.currentIndex];
    const currentId = track && this.playing ? track.id : null;
    if (currentId !== this.lastMetadataTrackId) {
      this.lastMetadataTrackId = currentId;
      if (track && this.playing) {
        api.updateMetadata(this.stationId, track.title, track.artist);
        updateIcecastMetadata(this.mount, track.title, track.artist);
      }
    }
  }

  broadcastError(message) {
    const msg = JSON.stringify({ type: "error", message });
    for (const ws of this.wsClients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }

  sendTo(ws, data) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  }

  // ── Teardown ──

  destroy() {
    if (this.stopping) return;
    this.stopping = true;

    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }

    if (this.socket) {
      try { this.socket.write("quit\n"); } catch {}
      this.socket.end();
      this.socket = null;
    }

    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }

    try { fs.unlinkSync(this.configPath); } catch {}
    try { fs.unlinkSync(this.socketPath); } catch {}

    for (const ws of this.wsClients) ws.close(1001, "Session ended");
    this.wsClients.clear();

    log("info", "Liquidsoap session destroyed", { stationId: this.stationId, mount: this.mount });
  }
}

// ── Helpers ──

function annotateUri(track) {
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const title = esc(track.title);
  const artist = esc(track.artist);
  return `annotate:title="${title}",artist="${artist}":file://${track.filePath}`;
}

async function resolveTracks(trackIds) {
  const tracks = [];
  for (const id of trackIds) {
    const info = await api.fetchTrackInfo(id);
    if (info) {
      tracks.push({
        id: info.id,
        title: info.title,
        artist: info.artist,
        duration: info.duration,
        filePath: info.path,
      });
    } else {
      log("warn", "Track not found, skipping", { trackId: id });
    }
  }
  return tracks;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = LiquidsoapSession;
