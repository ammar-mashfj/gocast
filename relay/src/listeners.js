const config = require("./config");
const log = require("./log");
const api = require("./api");

/**
 * Polls Icecast stats every 10 seconds and reports per-mount listener
 * counts to the API. Only queries when there are active mounts.
 * @param {() => Map<string, string>} getActiveMounts
 */
function startListenerPolling(getActiveMounts) {
  setInterval(async () => {
    const mounts = getActiveMounts();
    if (mounts.size === 0) return;

    try {
      const res = await fetch(`http://${config.icecast.host}:${config.icecast.port}/status-json.xsl`);
      const json = await res.json();

      const sources = json.icestats?.source;
      if (!sources) return;

      const sourceList = Array.isArray(sources) ? sources : [sources];

      for (const [mount, stationId] of mounts) {
        const source = sourceList.find((s) => s.listenurl?.includes(mount));
        const count = source ? source.listeners || 0 : 0;
        await api.updateListenerCount(stationId, count);
      }
    } catch (err) {
      log("error", "Failed to poll Icecast stats", { error: err.message });
    }
  }, 10000);
}

module.exports = { startListenerPolling };
