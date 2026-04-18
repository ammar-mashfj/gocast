require("dotenv").config();

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
  internalApiKey: process.env.INTERNAL_API_KEY || "",
  tracksPath: process.env.TRACKS_PATH || "/var/www/gocast/api/storage/app/tracks",
};

module.exports = config;
