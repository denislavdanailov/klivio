// PM2 Ecosystem — стартира Klivio като production service
// Инсталация: npm install -g pm2
// Старт:      pm2 start ecosystem.config.js
// Статус:     pm2 status
// Логове:     pm2 logs klivio
// Рестарт:    pm2 restart klivio
// Стоп:       pm2 stop klivio
// Автостарт:  pm2 startup  (след това изпълни командата, която ти показва)

module.exports = {
  apps: [
    {
      name: 'klivio',
      script: 'leadgen/orchestrator.js',
      cwd: 'D:\\KLIVIO',
      watch: false,
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'DD-MM HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    },
    {
      name: 'klivio-server',
      script: 'server.js',
      cwd: 'D:\\KLIVIO',
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'DD-MM HH:mm:ss',
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-out.log',
    },
  ],
};
