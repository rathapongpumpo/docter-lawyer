// pm2 process for the web tier on the shared dev/staging server (Phase 1).
// Postgres/Redis/ai run in deploy/docker-compose.dev.yml (restart: unless-stopped).
//
//   cd web && corepack pnpm run build                    # always build before (re)starting
//   pm2 startOrReload deploy/pm2/ecosystem.config.cjs     # from the repo root
//   pm2 logs legal-consult-web
//
// Env comes from web/.env.local (symlink to ../.env), loaded by Next itself.
// Production uses the Docker image in deploy/ instead of pm2.
const path = require('node:path');

const webDir = path.resolve(__dirname, '../../web');

module.exports = {
  apps: [
    {
      name: 'legal-consult-web',
      cwd: webDir,
      script: path.join(webDir, 'node_modules/next/dist/bin/next'),
      args: 'start -p 3200 -H 0.0.0.0',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '600M',
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
