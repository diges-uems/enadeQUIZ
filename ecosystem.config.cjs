/**
 * PM2 Process File — UEMS Votação (ENADE Quiz)
 * --------------------------------------------------------------------------
 * Manages 3 long-running services:
 *
 *   uems-next    — Next.js 16 standalone server  (port 3000, 127.0.0.1)
 *   uems-socket  — Socket.io real-time service   (port 3003, Bun)
 *   uems-stress  — Stress-test service           (port 3004, Bun)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save                      # persist process list across reboots
 *   pm2 startup systemd           # generate + enable systemd unit
 *   pm2 restart ecosystem.config.cjs --update-env
 *
 * Logs land in ~/.pm2/logs/  (uems-next-out.log, uems-next-error.log, ...)
 *
 * Memory limits trigger an automatic restart (max_memory_restart) to
 * recover from leaks without manual intervention.
 *
 * NOTE: Ports 3003 and 3004 are currently hard-coded inside the Bun
 * services (mini-services/enade-quiz/index.ts and
 * mini-services/stress-test/index.ts). Setting PORT in this env block
 * does NOT change them — edit the source if you need different ports.
 */
module.exports = {
  apps: [
    {
      name: 'uems-next',
      cwd: '/var/www/uems-votacao',
      script: '.next/standalone/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '127.0.0.1',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      watch: false,
      out_file: '~/.pm2/logs/uems-next-out.log',
      error_file: '~/.pm2/logs/uems-next-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'uems-socket',
      cwd: '/var/www/uems-votacao/mini-services/enade-quiz',
      script: 'index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '200M',
      watch: false,
      out_file: '~/.pm2/logs/uems-socket-out.log',
      error_file: '~/.pm2/logs/uems-socket-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'uems-stress',
      cwd: '/var/www/uems-votacao/mini-services/stress-test',
      script: 'index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '200M',
      watch: false,
      out_file: '~/.pm2/logs/uems-stress-out.log',
      error_file: '~/.pm2/logs/uems-stress-error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
