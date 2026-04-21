#!/usr/bin/env bash
# First-time Cloudflare setup for opencawl.ai
# Run this once before deploying.
set -euo pipefail

PROJECT_NAME="opencawl-phone"
DB_NAME="opencawl-phone-db"

echo "==> Creating Cloudflare Pages project..."
npx wrangler pages project create "$PROJECT_NAME" --production-branch main || true

echo "==> Creating D1 database..."
DB_OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1)
echo "$DB_OUTPUT"

# Extract the database_id from the output and patch wrangler.toml
DB_ID=$(echo "$DB_OUTPUT" | grep 'database_id' | sed 's/.*database_id = "\(.*\)".*/\1/')
if [ -n "$DB_ID" ] && [ "$DB_ID" != "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" ]; then
  echo "==> Patching wrangler.toml with database_id: $DB_ID"
  sed -i.bak "s/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/$DB_ID/" wrangler.toml
  rm -f wrangler.toml.bak
  echo "    wrangler.toml updated — commit this change."
else
  echo "WARNING: Could not extract database_id automatically."
  echo "Run: npx wrangler d1 list"
  echo "Then manually update wrangler.toml with the correct database_id."
fi

echo ""
echo "==> Setup complete."
echo "    Next: add your custom domain opencawl.ai in the Cloudflare Pages dashboard"
echo "    (Settings > Custom domains > Add custom domain)"
echo "    Then run: ./scripts/deploy.sh"
