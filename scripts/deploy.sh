#!/usr/bin/env bash
# Deploy opencawl.ai to Cloudflare Pages + D1
set -euo pipefail

DB_NAME="openclaw-phone-db"
PROJECT_NAME="opencawl-phone"
BRANCH="${1:-main}"

echo "==> Building..."
npm run build

echo "==> Applying D1 migrations (remote)..."
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "==> Deploying to Cloudflare Pages (branch: $BRANCH)..."
npx wrangler pages deploy dist \
  --project-name "$PROJECT_NAME" \
  --branch "$BRANCH"

echo ""
echo "==> Deploy complete."
echo "    Production: https://opencawl.ai"
echo "    Dashboard:  https://dash.cloudflare.com"
