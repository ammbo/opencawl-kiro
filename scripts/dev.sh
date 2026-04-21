#!/usr/bin/env bash
# Local dev server: Vite (HMR) + Cloudflare Pages Functions + local D1
set -euo pipefail

echo "==> Applying local D1 migrations..."
npx wrangler d1 migrations apply openclaw-phone-db --local

echo "==> Starting Vite + Wrangler Pages dev..."
# Vite runs on :5173 for HMR; wrangler proxies it and serves Functions on :8788
npx vite &
VITE_PID=$!
trap "kill $VITE_PID 2>/dev/null" EXIT INT TERM

# Wait for Vite to be ready
sleep 2

npx wrangler pages dev --proxy 5173
