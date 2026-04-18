#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.local ]] || ! grep -q "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" .env.local; then
  echo "ERROR: NEXT_SERVER_ACTIONS_ENCRYPTION_KEY missing from .env.local"
  echo "Generate once with: echo \"NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=\$(openssl rand -base64 32)\" >> .env.local"
  echo "Then back up the value to your password manager — rotating it invalidates every active client's Server Actions."
  exit 1
fi

git pull --ff-only
npm ci

export NEXT_DEPLOYMENT_ID=$(git rev-parse --short HEAD)
npm run build

pm2 reload gocast-client --update-env
pm2 save

echo "Deployed $NEXT_DEPLOYMENT_ID"
