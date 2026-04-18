const http = require("http");
const config = require("./config");
const log = require("./log");

/**
 * Updates the "now playing" metadata on an Icecast mount via the admin API.
 * Fire-and-forget — errors are logged but not propagated.
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
    log("error", "Failed to update Icecast metadata", { mount, error: err.message });
  });

  req.setTimeout(5000, () => {
    req.destroy();
    log("error", "Icecast metadata request timed out", { mount });
  });

  req.end();
}

module.exports = { updateIcecastMetadata };
