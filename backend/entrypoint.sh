#!/usr/bin/env bash
set -e
echo "[entrypoint] pushing prisma schema"
npx prisma db push --skip-generate --accept-data-loss
echo "[entrypoint] seeding (idempotent)"
node dist-seed/seed.js || echo "[entrypoint] seed skipped/failed"
echo "[entrypoint] starting backend"
exec node dist/main.js
