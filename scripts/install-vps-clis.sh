#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# install-vps-clis.sh — Install the agent CLI set on the company VPS
#
# Run once per VPS (idempotent; re-running is safe but slow).
# Installs Node 22, pnpm, and the coding-agent CLIs *system-wide* so that
# every Linux user provisioned by the app gets the same CLI inventory.
#
# Also installs ttyd for the web-terminal feature.
#
# Usage:
#   scp scripts/install-vps-clis.sh root@<vps>:/tmp/
#   ssh root@<vps> bash /tmp/install-vps-clis.sh
# ═══════════════════════════════════════════════════════════════════

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root"
  exit 1
fi

NODE_VERSION=22

export DEBIAN_FRONTEND=noninteractive

echo "[1/6] apt packages..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates curl git jq python3 python3-pip unzip sudo procps \
  build-essential \
  >/dev/null

echo "[2/6] Node ${NODE_VERSION}..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" != "${NODE_VERSION}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null
  apt-get install -y --no-install-recommends nodejs >/dev/null
fi
corepack enable || true
corepack prepare pnpm@latest --activate || true

echo "[3/6] ttyd (web-terminal)..."
if ! command -v ttyd >/dev/null 2>&1; then
  # Prefer prebuilt static binary from the upstream release page; falls back to apt.
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) TTYD_URL="https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64" ;;
    aarch64) TTYD_URL="https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.aarch64" ;;
    *) TTYD_URL="" ;;
  esac
  if [ -n "$TTYD_URL" ] && curl -fsSL -o /usr/local/bin/ttyd "$TTYD_URL"; then
    chmod +x /usr/local/bin/ttyd
  else
    apt-get install -y --no-install-recommends ttyd >/dev/null || {
      echo "WARNING: ttyd install failed; web-terminal feature will be unavailable"
    }
  fi
fi

echo "[4/6] cowork group..."
getent group cowork >/dev/null 2>&1 || groupadd cowork

echo "[5/6] agent CLIs (global npm)..."
# Primary agent: Claude Code
npm install -g @anthropic-ai/claude-code >/dev/null 2>&1 || echo "  claude install failed"

# Optional agents; continue on failure to avoid blocking the VPS bootstrap.
npm install -g @openai/codex >/dev/null 2>&1 || echo "  codex install failed"
npm install -g @github/copilot-cli >/dev/null 2>&1 || echo "  copilot install failed"
npm install -g cursor-cli >/dev/null 2>&1 || echo "  cursor install failed"
npm install -g @google/gemini-cli >/dev/null 2>&1 || echo "  gemini install failed"
npm install -g opencode-cli >/dev/null 2>&1 || echo "  opencode install failed"

echo "[6/6] sudoers fragment..."
# Allow root to use `sudo -u <user>` without password (it already can, but this
# makes the intent explicit and leaves a breadcrumb for auditors).
cat > /etc/sudoers.d/cowork-control-plane <<'SUDO'
# Cowork-Claw control-plane: root -> any cowork-group user, no password
root ALL=(%cowork) NOPASSWD: ALL
SUDO
chmod 440 /etc/sudoers.d/cowork-control-plane

echo ""
echo "══════════════════════════════════════"
echo "  VPS bootstrap complete"
echo ""
echo "  Node:    $(node -v 2>/dev/null || echo missing)"
echo "  pnpm:    $(pnpm -v 2>/dev/null || echo missing)"
echo "  claude:  $(command -v claude >/dev/null && echo ok || echo missing)"
echo "  codex:   $(command -v codex >/dev/null && echo ok || echo missing)"
echo "  ttyd:    $(command -v ttyd >/dev/null && echo ok || echo missing)"
echo "══════════════════════════════════════"
echo ""
echo "REVERSE PROXY (ttyd exposure)"
echo ""
echo "  Terminal sessions spawn ttyd on 127.0.0.1:40000-40999 (see"
echo "  lib/company/terminal-session.ts). A reverse proxy must forward"
echo "  /ttyd/<port>/ traffic (HTTP + WebSocket) to 127.0.0.1:<port>."
echo ""
echo "  Example Caddyfile block (save to /etc/caddy/Caddyfile.d/ttyd.caddy):"
echo ""
echo '    @ttyd path_regexp port ^/ttyd/([0-9]{4,5})(/.*)?$'
echo '    handle @ttyd {'
echo '      uri replace /ttyd/{re.port.1} ""'
echo '      reverse_proxy 127.0.0.1:{re.port.1}'
echo '    }'
echo ""
echo "  Then set the app env var:"
echo "    TERMINAL_PROXY_URL=https://<app-host>/ttyd"
echo ""
echo "  Ports are restricted to 40000-40999 and protected with per-session"
echo "  HTTP basic auth; ttyd runs with --once so the process dies on close."
