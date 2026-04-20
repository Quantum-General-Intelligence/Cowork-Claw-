#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# provision-company.sh — Deploy a per-company Cowork-Claw instance
#
# Usage:
#   Internal (existing VPS):
#     ./scripts/provision-company.sh --company trelexa --ip 31.220.108.185 --internal
#
#   Client (new Hostinger VPS):
#     ./scripts/provision-company.sh --company acme --vps-id 796886
#
# What it does:
#   1. Installs SSH key on the target VPS (via Hostinger API if needed)
#   2. Installs Docker if missing
#   3. Creates /opt/cowork-claw-{company}/ with the app code
#   4. Configures .env.local (shared Supabase, company-specific settings)
#   5. Creates a docker-compose for that company
#   6. Creates DNS record: {company}.cowork-claw.ai → VPS IP
#   7. Builds the Docker image
#   8. Runs DB migrations
#   9. Seeds company-specific templates
#  10. Starts the containers
#
# Env vars required (from .env.local):
#   HOSTINGER_API_TOKEN, CF_API_EMAIL, CF_GLOBAL_API_KEY, SANDBOX_SSH_KEY
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse args
COMPANY=""
IP=""
VPS_ID=""
INTERNAL=false
PORT=3000
CF_ZONE_ID="5ccd9aac7ce696b64c3f561597cc124f"

while [[ $# -gt 0 ]]; do
  case $1 in
    --company) COMPANY="$2"; shift 2 ;;
    --ip) IP="$2"; shift 2 ;;
    --vps-id) VPS_ID="$2"; shift 2 ;;
    --internal) INTERNAL=true; shift ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$COMPANY" ]; then
  echo "Usage: $0 --company <name> [--ip <ip> | --vps-id <id>] [--internal] [--port <port>]"
  exit 1
fi

# Load env
set -a
source "$REPO_ROOT/.env.local" 2>/dev/null || true
set +a

SUBDOMAIN="${COMPANY}.cowork-claw.ai"
DEPLOY_DIR="/opt/cowork-claw-${COMPANY}"
SSH_KEY_FILE=$(mktemp)
trap 'rm -f "$SSH_KEY_FILE"' EXIT

# ── Step 1: Get VPS IP ──────────────────────────────────────────
if [ -z "$IP" ] && [ -n "$VPS_ID" ]; then
  echo "[1/10] Looking up VPS $VPS_ID IP..."
  IP=$(curl -s "https://developers.hostinger.com/api/vps/v1/virtual-machines/$VPS_ID" \
    -H "Authorization: Bearer $HOSTINGER_API_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ipv4=d.get('ipv4',[])
print(ipv4[0]['address'] if isinstance(ipv4,list) and len(ipv4)>0 else '')
" 2>/dev/null)
  echo "  IP: $IP"
fi

if [ -z "$IP" ]; then
  echo "ERROR: No IP. Provide --ip or --vps-id"
  exit 1
fi

# ── Step 2: Install SSH key ─────────────────────────────────────
echo "[2/10] Setting up SSH access to $IP..."
printf '%s' "$SANDBOX_SSH_KEY" | base64 -d > "$SSH_KEY_FILE"
chmod 600 "$SSH_KEY_FILE"
SSH="ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"

# Test if key works
if $SSH root@$IP 'echo SSH_OK' 2>/dev/null | grep -q SSH_OK; then
  echo "  SSH key already works"
else
  echo "  SSH key not authorized — installing via Hostinger API..."
  if [ -z "$VPS_ID" ]; then
    echo "  ERROR: Need --vps-id to install SSH key via API"
    exit 1
  fi

  # Reset password via Hostinger API
  NEW_PASS="CoworkClaw-$(openssl rand -hex 4)"
  curl -s -X POST "https://developers.hostinger.com/api/vps/v1/virtual-machines/$VPS_ID/reset-root-password" \
    -H "Authorization: Bearer $HOSTINGER_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"password\": \"$NEW_PASS\"}" > /dev/null 2>&1

  echo "  Waiting for password reset (30s)..."
  sleep 30

  # Install SSH key via sshpass
  if command -v sshpass >/dev/null 2>&1; then
    PUB_KEY=$(ssh-keygen -y -f "$SSH_KEY_FILE" 2>/dev/null)
    sshpass -p "$NEW_PASS" ssh -o StrictHostKeyChecking=no root@$IP \
      "mkdir -p ~/.ssh && echo '$PUB_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" 2>/dev/null
    echo "  SSH key installed"
  else
    echo "  WARNING: sshpass not available. Manually install SSH key on $IP"
    echo "  Password: $NEW_PASS"
    echo "  Then re-run this script."
    exit 1
  fi
fi

# ── Step 3: Install Docker if missing ───────────────────────────
echo "[3/10] Checking Docker on $IP..."
DOCKER_OK=$($SSH root@$IP 'docker --version 2>/dev/null && echo OK || echo MISSING' 2>/dev/null | tail -1)
if [ "$DOCKER_OK" = "MISSING" ]; then
  echo "  Installing Docker..."
  $SSH root@$IP 'curl -fsSL https://get.docker.com | sh' 2>/dev/null
fi
echo "  Docker: $($SSH root@$IP 'docker --version 2>/dev/null' | head -1)"

# ── Step 4: Deploy code ─────────────────────────────────────────
echo "[4/10] Deploying code to $IP:$DEPLOY_DIR..."
$SSH root@$IP "mkdir -p $DEPLOY_DIR /var/lib/cowork-artifacts"

rsync -avz --delete \
  --exclude 'node_modules' --exclude '.next' --exclude '.env.local' \
  --exclude '.git' --exclude 'modules' --exclude 'opensrc' --exclude '.claude' \
  --exclude 'docs/superpowers' --exclude 'docker-compose.prod.yml' \
  -e "ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
  "$REPO_ROOT/" "root@$IP:$DEPLOY_DIR/" > /dev/null 2>&1
echo "  Code synced"

# ── Step 5: Configure .env.local ────────────────────────────────
echo "[5/10] Configuring environment..."

# Generate company-specific secrets
ENC_KEY=$(openssl rand -hex 32)

# Create SSH key for sandbox (self-referencing — the VPS runs its own containers)
SELF_SSH_KEY=$SANDBOX_SSH_KEY

$SSH root@$IP "cat > $DEPLOY_DIR/.env.local << 'ENVEOF'
# ── Cowork-Claw: ${COMPANY} instance ──
POSTGRES_URL=postgresql://cowork:CoworkClaw-DB-2026@31.220.108.185:5432/coworkclaw
ENCRYPTION_KEY=${ENC_KEY}

# Supabase (shared — handles all auth: email, Google, GitHub)
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

# Which providers to surface on /auth
NEXT_PUBLIC_AUTH_PROVIDERS=${NEXT_PUBLIC_AUTH_PROVIDERS:-email,google,github}

# Optional: deep-link client ID for the "Reconfigure GitHub access" UX
NEXT_PUBLIC_GITHUB_CLIENT_ID=${NEXT_PUBLIC_GITHUB_CLIENT_ID:-}

# Company VPS control-plane SSH (self — connects back to this same box as
# root so the app can provision/dispatch to per-user Linux accounts)
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
echo "  .env.local written"

# ── Step 6: Create docker-compose ───────────────────────────────
echo "[6/10] Creating docker-compose..."
$SSH root@$IP "cat > $DEPLOY_DIR/docker-compose.prod.yml << 'COMPEOF'
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
echo "  Compose created (port $PORT, subdomain $SUBDOMAIN)"

# ── Step 7: Create DNS record ───────────────────────────────────
echo "[7/10] Creating DNS: $SUBDOMAIN → $IP..."
# Check if record exists
EXISTING=$(curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?type=A&name=$SUBDOMAIN" \
  -H "X-Auth-Email: $CF_API_EMAIL" \
  -H "X-Auth-Key: $CF_GLOBAL_API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'] if json.load(open('/dev/stdin' if False else sys.stdin))['result'] else '')" 2>/dev/null || echo "")

if [ -n "$EXISTING" ] && [ "$EXISTING" != "" ]; then
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$EXISTING" \
    -H "X-Auth-Email: $CF_API_EMAIL" \
    -H "X-Auth-Key: $CF_GLOBAL_API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$SUBDOMAIN\",\"content\":\"$IP\",\"proxied\":false,\"ttl\":300}" > /dev/null 2>&1
  echo "  Updated existing record"
else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
    -H "X-Auth-Email: $CF_API_EMAIL" \
    -H "X-Auth-Key: $CF_GLOBAL_API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$SUBDOMAIN\",\"content\":\"$IP\",\"proxied\":false,\"ttl\":300}" > /dev/null 2>&1
  echo "  Created new record"
fi

# ── Step 8: Build Docker image ──────────────────────────────────
echo "[8/10] Building Docker image (this takes 3-5 min)..."
$SSH root@$IP "cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml build --no-cache 2>&1 | tail -3"

# ── Step 9: Install agent CLIs + ttyd on the host ───────────────
# Persistent-user-environments model: CLIs live on the VPS, not in a runner
# image. This bootstrap is idempotent; safe to re-run.
echo "[9/10] Installing agent CLIs + ttyd on host..."
$SSH root@$IP "bash -s" < "$REPO_ROOT/scripts/install-vps-clis.sh" 2>&1 | tail -10

# ── Step 10: Start ──────────────────────────────────────────────
echo "[10/10] Starting..."
$SSH root@$IP "cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml up -d 2>&1"

# Wait and verify
sleep 8
STATUS=$($SSH root@$IP "curl -sL -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/auth" 2>/dev/null)

echo ""
echo "═══════════════════════════════════════════════"
echo "  COMPANY INSTANCE PROVISIONED"
echo "═══════════════════════════════════════════════"
echo "  Company:   $COMPANY"
echo "  URL:       https://$SUBDOMAIN"
echo "  VPS:       $IP (port $PORT)"
echo "  Deploy:    $DEPLOY_DIR"
echo "  Status:    HTTP $STATUS"
echo ""
echo "  Next steps:"
echo "    1. Add $SUBDOMAIN redirect URL in Supabase dashboard"
echo "    2. Seed templates: POSTGRES_URL=... pnpm exec tsx scripts/seed-templates.ts"
echo "    3. Share https://$SUBDOMAIN with the team"
echo "═══════════════════════════════════════════════"
