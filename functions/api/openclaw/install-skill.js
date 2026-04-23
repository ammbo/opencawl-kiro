/**
 * GET /api/openclaw/install-skill
 *
 * Serves a shell script that downloads and installs the OpenCawl skill
 * into the user's OpenClaw skills directory.
 *
 * Usage: curl -fsSL https://opencawl.ai/api/openclaw/install-skill | sh
 *
 * No auth required — the skill itself is public. The API key is configured
 * separately after installation.
 */

const INSTALL_SCRIPT = `#!/bin/sh
set -e

# OpenCawl Skill Installer
# Installs the OpenCawl skill into your OpenClaw instance.

SKILL_DIR=""
SKILL_NAME="opencawl"

# Detect OpenClaw skills directory
if [ -d "$HOME/.openclaw/workspace/skills" ]; then
  SKILL_DIR="$HOME/.openclaw/workspace/skills/$SKILL_NAME"
elif [ -d "$HOME/.openclaw/skills" ]; then
  SKILL_DIR="$HOME/.openclaw/skills/$SKILL_NAME"
else
  # Default to workspace skills
  SKILL_DIR="$HOME/.openclaw/workspace/skills/$SKILL_NAME"
  mkdir -p "$HOME/.openclaw/workspace/skills"
fi

echo "Installing OpenCawl skill to $SKILL_DIR ..."

# Create skill directory
mkdir -p "$SKILL_DIR/scripts"

# Download SKILL.md
curl -fsSL "BASEURL/opencawl/SKILL.md" -o "$SKILL_DIR/SKILL.md"

# Download CLI script
curl -fsSL "BASEURL/opencawl/scripts/opencawl.mjs" -o "$SKILL_DIR/scripts/opencawl.mjs"
chmod +x "$SKILL_DIR/scripts/opencawl.mjs"

echo ""
echo "✓ OpenCawl skill installed to $SKILL_DIR"
echo ""
echo "Next steps:"
echo "  1. Add your API key to ~/.openclaw/.env:"
echo "     printf '\\\\nOPENCAWL_API_KEY=your-key-here\\\\n' >> ~/.openclaw/.env"
echo "  2. Get your API key from the OpenCawl dashboard: https://opencawl.ai"
echo "  3. Your Claw now has a phone number. Try: /opencawl transcripts"
echo ""
`;

export async function onRequestGet(context) {
  // Replace BASEURL placeholder with the actual origin
  const url = new URL(context.request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const script = INSTALL_SCRIPT.replaceAll('BASEURL', baseUrl);

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
