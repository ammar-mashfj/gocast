const config = require("./config");
const log = require("./log");

function headers() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Internal-Key": config.internalApiKey,
  };
}

async function validateStreamToken(stationId, token) {
  const res = await fetch(`${config.apiUrl}/internal/validate-stream`, {
    method: "POST",
    headers: headers(),
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
      headers: headers(),
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
      headers: headers(),
      body: JSON.stringify({ station_id: stationId, count }),
    });
  } catch (err) {
    log("error", "Failed to update listener count", { stationId, error: err.message });
  }
}

async function notifyStreamEnded(stationId) {
  try {
    await fetch(`${config.apiUrl}/internal/stream-ended`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ station_id: stationId }),
    });
  } catch (err) {
    log("error", "Failed to notify API of stream end", { stationId, error: err.message });
  }
}

async function resetLiveStations() {
  try {
    const res = await fetch(`${config.apiUrl}/internal/reset-live`, {
      method: "POST",
      headers: headers(),
    });
    const json = await res.json();
    log("info", "Reset stale live stations", { count: json.count });
  } catch (err) {
    log("error", "Failed to reset live stations", { error: err.message });
  }
}

async function fetchTrackInfo(trackId) {
  const res = await fetch(`${config.apiUrl}/internal/tracks/${trackId}`, {
    headers: headers(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

module.exports = {
  validateStreamToken,
  updateMetadata,
  updateListenerCount,
  notifyStreamEnded,
  resetLiveStations,
  fetchTrackInfo,
};
