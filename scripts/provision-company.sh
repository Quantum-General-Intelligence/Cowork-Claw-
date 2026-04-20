#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# provision-company.sh — Deploy a company tenant onto the QGI VPS
#
# All QGI-owned companies share ONE Hostinger VPS (gallitron-V32).
# This script drops a tenant stack onto it:
#   /opt/cowork-claw-<company>/  (code + compose + .env.local)
#   docker-compose labelled for Traefik at <company>.cowork-claw.ai
#   DNS A record to 31.220.108.185
#
# Prerequisites on the host (set up once, outside this script):
#   - Docker + Traefik (baked into the Hostinger template)
#   - scripts/install-vps-clis.sh has been run (Node, pnpm, ttyd, Caddy,
#     claude/codex/cursor/gemini/copilot CLIs). This runs from this
#     script too, and is idempotent.
#
# Usage:
#   ./scripts/provision-company.sh --company trelexa
#   ./scripts/provision-company.sh --company acme --port 3042
#
# Env vars required (from .env.local):
#   SANDBOX_SSH_KEY  (base64 PEM, authorized on gallitron as root)
#   CF_API_EMAIL, CF_GLOBAL_API_KEY   (Cloudflare for DNS)
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── QGI single-VPS constants (gallitron-V32 / Hostinger id 857641) ──
QGI_VPS_IP="31.220.108.185"
QGI_VPS_HOSTNAME="gallitron-V32.qgi.dev"
CF_ZONE_ID="5ccd9aac7ce696b64c3f561597cc124f"

# ── Args ────────────────────────────────────────────────────────────
COMPANY=""
PORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --company) COMPANY="$2"; shift 2 ;;
    --port)    PORT="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$COMPANY" ]; then
  echo "Usage: $0 --company <name> [--port <port>]"
  exit 1
fi

# Deterministic port per company in 3000..3099 so multiple tenants on
# the same host never collide. Override via --port for a pinned value.
if [ -z "$PORT" ]; then
  # 0x64 = 100; shifts hash into the 3000..3099 range.
  PORT=$(( 3000 + ( 0x$(printf '%s' "$COMPANY" | sha256sum | head -c 8) % 100 ) ))
fi

# ── Load local env ──────────────────────────────────────────────────
set -a
source "$REPO_ROOT/.env.local" 2>/dev/null || true
set +a

SUBDOMAIN="${COMPANY}.cowork-claw.ai"
DEPLOY_DIR="/opt/cowork-claw-${COMPANY}"
SSH_KEY_FILE=$(mktemp)
trap 'rm -f "$SSH_KEY_FILE"' EXIT

printf '%s' "$SANDBOX_SSH_KEY" | base64 -d > "$SSH_KEY_FILE"
chmod 600 "$SSH_KEY_FILE"
SSH="ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"

echo "═══════════════════════════════════════════════"
echo "  Provisioning company tenant on QGI VPS"
echo "═══════════════════════════════════════════════"
echo "  Company:    $COMPANY"
echo "  Subdomain:  $SUBDOMAIN"
echo "  Port:       $PORT"
echo "  Host:       $QGI_VPS_HOSTNAME ($QGI_VPS_IP)"
echo "  Deploy dir: $DEPLOY_DIR"
echo "  ────────────────────────────────────────────"

# ── Step 1: SSH reachability ────────────────────────────────────────
echo "[1/8] Verifying SSH access to $QGI_VPS_IP..."
if ! $SSH "root@$QGI_VPS_IP" 'echo SSH_OK' 2>/dev/null | grep -q SSH_OK; then
  echo "  ERROR: Cannot SSH to $QGI_VPS_IP as root."
  echo "  Check SANDBOX_SSH_KEY is authorized on gallitron-V32."
  exit 1
fi
echo "  ✓ SSH OK"

# ── Step 2: Host bootstrap (idempotent) ─────────────────────────────
echo "[2/8] Ensuring Docker + VPS CLIs + ttyd + Caddy are installed..."
DOCKER_OK=$($SSH "root@$QGI_VPS_IP" 'docker --version 2>/dev/null && echo OK || echo MISSING' | tail -1)
if [ "$DOCKER_OK" = "MISSING" ]; then
  $SSH "root@$QGI_VPS_IP" 'curl -fsSL https://get.docker.com | sh' >/dev/null 2>&1
  echo "  ✓ Docker installed"
else
  echo "  ✓ Docker already present"
fi

$SSH "root@$QGI_VPS_IP" "mkdir -p /var/lib/cowork-artifacts"
$SSH "root@$QGI_VPS_IP" "bash -s" < "$REPO_ROOT/scripts/install-vps-clis.sh" 2>&1 | tail -5
echo "  ✓ Host bootstrap complete"

# ── Step 3: Sync code ───────────────────────────────────────────────
echo "[3/8] Syncing code to $DEPLOY_DIR..."
$SSH "root@$QGI_VPS_IP" "mkdir -p $DEPLOY_DIR"
rsync -az --delete \
  --exclude 'node_modules' --exclude '.next' --exclude '.env.local' \
  --exclude '.git' --exclude 'modules' --exclude 'opensrc' --exclude '.claude' \
  --exclude 'docs/superpowers' --exclude 'docker-compose.prod.yml' \
  -e "ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
  "$REPO_ROOT/" "root@$QGI_VPS_IP:$DEPLOY_DIR/" >/dev/null 2>&1
echo "  ✓ Code synced"

# ── Step 4: .env.local for this tenant ──────────────────────────────
echo "[4/8] Writing .env.local..."
ENC_KEY=$(openssl rand -hex 32)
SELF_SSH_KEY=$SANDBOX_SSH_KEY

$SSH "root@$QGI_VPS_IP" "cat > $DEPLOY_DIR/.env.local << 'ENVEOF'
# ── Cowork-Claw tenant: ${COMPANY} on QGI VPS ──
POSTGRES_URL=postgresql://cowork:CoworkClaw-DB-2026@127.0.0.1:5432/coworkclaw
ENCRYPTION_KEY=${ENC_KEY}

# Supabase (shared — handles all auth: email, Google, GitHub)
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

# Which providers to surface on /auth
NEXT_PUBLIC_AUTH_PROVIDERS=${NEXT_PUBLIC_AUTH_PROVIDERS:-email,google,github}

# Optional: deep-link client ID for the 'Reconfigure GitHub access' UX
NEXT_PUBLIC_GITHUB_CLIENT_ID=${NEXT_PUBLIC_GITHUB_CLIENT_ID:-}

# Company VPS control-plane SSH (loopback — the app dispatches tasks
# to per-user Linux accounts on this same host via sudo -u)
SANDBOX_SSH_HOST=127.0.0.1
SANDBOX_SSH_PORT=22
SANDBOX_SSH_USER=root
SANDBOX_SSH_KEY=${SELF_SSH_KEY}
ARTIFACT_ROOT=/var/lib/cowork-artifacts

# Public base URL for the ttyd reverse proxy (Caddy snippet from
# install-vps-clis.sh listens at /ttyd/<port>/)
TERMINAL_PROXY_URL=https://${SUBDOMAIN}/ttyd

# AI Keys (employees bring their own via /onboarding/key)
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
GOOGLE_API_KEY=${GOOGLE_API_KEY:-}

# Stripe
STRIPE_SECRET_KEY=${STRIPE_THEOSYM_SECRET_KEY:-}
STRIPE_HOBBY_PRICE_ID=${STRIPE_HOBBY_PRICE_ID:-}
STRIPE_PRO_PRICE_ID=${STRIPE_PRO_PRICE_ID:-}
STRIPE_STUDIO_PRICE_ID=${STRIPE_STUDIO_PRICE_ID:-}
STRIPE_WHITELABEL_PRICE_ID=${STRIPE_WHITELABEL_PRICE_ID:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
ENVEOF
"
echo "  ✓ .env.local written"

# ── Step 5: docker-compose.prod.yml ─────────────────────────────────
echo "[5/8] Writing docker-compose..."
$SSH "root@$QGI_VPS_IP" "cat > $DEPLOY_DIR/docker-compose.prod.yml << 'COMPEOF'
services:
  cowork-claw-${COMPANY}:
    build:
      context: .
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
        NEXT_PUBLIC_AUTH_PROVIDERS: ${NEXT_PUBLIC_AUTH_PROVIDERS:-email,google,github}
        NEXT_PUBLIC_GITHUB_CLIENT_ID: ${NEXT_PUBLIC_GITHUB_CLIENT_ID:-}
    restart: unless-stopped
    env_file: .env.local
    network_mode: host
    environment:
      - PORT=${PORT}
    labels:
      - \"traefik.enable=true\"
      - \"traefik.http.routers.cw-${COMPANY}.rule=Host(\`${SUBDOMAIN}\`)\"
      - \"traefik.http.routers.cw-${COMPANY}.entrypoints=websecure\"
      - \"traefik.http.routers.cw-${COMPANY}.tls.certresolver=letsencrypt\"
      - \"traefik.http.services.cw-${COMPANY}.loadbalancer.server.url=http://127.0.0.1:${PORT}\"
COMPEOF
"
echo "  ✓ Compose written (port $PORT → Traefik @ $SUBDOMAIN)"

# ── Step 6: DNS (Cloudflare) ────────────────────────────────────────
echo "[6/8] Upserting Cloudflare DNS $SUBDOMAIN → $QGI_VPS_IP..."
EXISTING=$(curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?type=A&name=$SUBDOMAIN" \
  -H "X-Auth-Email: $CF_API_EMAIL" \
  -H "X-Auth-Key: $CF_GLOBAL_API_KEY" \
  | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin).get('result', [])
    print(r[0]['id'] if r else '')
except Exception:
    print('')
" 2>/dev/null || echo "")

if [ -n "$EXISTING" ]; then
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$EXISTING" \
    -H "X-Auth-Email: $CF_API_EMAIL" \
    -H "X-Auth-Key: $CF_GLOBAL_API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$SUBDOMAIN\",\"content\":\"$QGI_VPS_IP\",\"proxied\":false,\"ttl\":300}" > /dev/null
  echo "  ✓ Updated existing A record"
else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
    -H "X-Auth-Email: $CF_API_EMAIL" \
    -H "X-Auth-Key: $CF_GLOBAL_API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$SUBDOMAIN\",\"content\":\"$QGI_VPS_IP\",\"proxied\":false,\"ttl\":300}" > /dev/null
  echo "  ✓ Created new A record"
fi

# ── Step 7: Build + start ───────────────────────────────────────────
echo "[7/8] Building image (3-5 min)..."
$SSH "root@$QGI_VPS_IP" "cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml build --no-cache 2>&1 | tail -3"

echo "[8/8] Starting container..."
$SSH "root@$QGI_VPS_IP" "cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml up -d 2>&1 | tail -5"

# Verify
sleep 8
STATUS=$($SSH "root@$QGI_VPS_IP" "curl -sL -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/auth" 2>/dev/null)

echo ""
echo "═══════════════════════════════════════════════"
echo "  TENANT PROVISIONED"
echo "═══════════════════════════════════════════════"
echo "  URL:       https://$SUBDOMAIN"
echo "  Local:     http://127.0.0.1:$PORT (on gallitron)"
echo "  Deploy:    $DEPLOY_DIR"
echo "  Status:    HTTP $STATUS"
echo ""
echo "  Next steps:"
echo "    1. Add $SUBDOMAIN/auth/callback to Supabase → URL Redirects"
echo "    2. Seed templates if needed:"
echo "         POSTGRES_URL=... pnpm exec tsx scripts/seed-templates.ts"
echo "    3. Share https://$SUBDOMAIN with the team"
echo "═══════════════════════════════════════════════"
