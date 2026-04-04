module.exports = {
  apps: [
    {
      name: 'gocast-relay',
      script: 'index.js',
      env_file: '.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
