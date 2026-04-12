#!/usr/bin/env sh
set -eu

# Builds cowork-claw/runner:latest on the remote docker host over SSH.
# Requires SANDBOX_SSH_HOST, SANDBOX_SSH_PORT, SANDBOX_SSH_USER, SANDBOX_SSH_KEY in env
# (SANDBOX_SSH_KEY is base64 of a PEM — same convention as lib/sandbox/providers/docker.ts).

if [ -z "${SANDBOX_SSH_HOST:-}" ]; then
  echo "SANDBOX_SSH_HOST is required" >&2
  exit 1
fi
if [ -z "${SANDBOX_SSH_KEY:-}" ]; then
  echo "SANDBOX_SSH_KEY is required" >&2
  exit 1
fi

PORT="${SANDBOX_SSH_PORT:-22}"
USER="${SANDBOX_SSH_USER:-root}"
KEYFILE="$(mktemp)"
trap 'rm -f "$KEYFILE"' EXIT
printf '%s' "$SANDBOX_SSH_KEY" | base64 -d > "$KEYFILE"
chmod 600 "$KEYFILE"

SSH="ssh -i $KEYFILE -p $PORT -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $USER@$SANDBOX_SSH_HOST"

echo "Creating remote build dir..."
$SSH 'rm -rf /tmp/cowork-runner-build && mkdir -p /tmp/cowork-runner-build'

echo "Shipping build context..."
tar -C docker/runner -cf - Dockerfile entrypoint.sh | $SSH 'tar -C /tmp/cowork-runner-build -xf -'

echo "Building image..."
$SSH 'cd /tmp/cowork-runner-build && docker build -t cowork-claw/runner:latest .'

echo "Verifying image..."
$SSH 'docker image inspect cowork-claw/runner:latest --format "{{.Id}}"'

echo "Done."
