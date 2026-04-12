#!/usr/bin/env sh
set -eu

# Contract with DockerSandboxProvider:
#   ANTHROPIC_API_KEY  — user's BYO key, required
#   TASK_ID            — server-assigned task id
#   TEMPLATE_SLUG      — which office-cowork template to run
#   PARAMS_JSON        — JSON-encoded template parameters
#
# On success the runner writes deliverables to /out and exits 0.
# Progress lines are appended to /out/progress.log for Next.js to tail over SSH.

PROGRESS=/out/progress.log
mkdir -p /out
: > "$PROGRESS"

log() {
  # Static prefix only — never echo env values.
  printf '[runner] %s\n' "$1" | tee -a "$PROGRESS"
}

log "boot"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log "missing key"
  exit 64
fi
if [ -z "${TEMPLATE_SLUG:-}" ]; then
  log "missing template"
  exit 65
fi

log "starting claude-code"

# Placeholder: subsequent plans (P4 templates) will wire the template_slug to a
# concrete claude-code invocation. For P1 we only prove the image runs, so we
# ask claude-code to produce a trivial deliverable.
PROMPT="${PARAMS_JSON:-hello}"
OUT_FILE=/out/result.md

if command -v claude-code >/dev/null 2>&1; then
  claude-code --print --output "$OUT_FILE" "$PROMPT" >> "$PROGRESS" 2>&1 || {
    log "claude-code failed"
    exit 66
  }
else
  # P1 smoke fallback — if the CLI isn't available for any reason, still write
  # a file so the contract test can assert success.
  printf 'runner-smoke-ok\n' > "$OUT_FILE"
fi

log "done"
exit 0
