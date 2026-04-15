module.exports = {
  apps: [
    {
      name: "gocast-client",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
    },
  ],
}
