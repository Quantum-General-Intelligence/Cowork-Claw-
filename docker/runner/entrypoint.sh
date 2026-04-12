#!/usr/bin/env sh
set -eu

# Contract with DockerSandboxProvider:
#   ANTHROPIC_API_KEY  — user's BYO key, required
#   TASK_ID            — server-assigned task id
#   TEMPLATE_SLUG      — which office-cowork template to run
#   PARAMS_JSON        — JSON-encoded template parameters
#   TASK_PROMPT        — the fully rendered prompt (template + params merged)
#
# On success the runner writes deliverables to /out and exits 0.
# Progress lines are appended to /out/progress.log for the UI to stream.

PROGRESS=/out/progress.log
mkdir -p /out
: > "$PROGRESS"

log() {
  printf '[runner] %s\n' "$1" | tee -a "$PROGRESS"
}

log "boot"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log "error: missing API key"
  exit 64
fi

PROMPT="${TASK_PROMPT:-${PARAMS_JSON:-Produce a brief summary document.}}"

log "starting agent"

# Use claude CLI in print mode (non-interactive, outputs to stdout)
# --output-format text ensures clean text output
# All deliverables should be written to /out/ by the agent
claude --print \
  --allowedTools "computer,bash,edit,write" \
  --output-format text \
  "$PROMPT

IMPORTANT INSTRUCTIONS FOR THE AGENT:
- Write ALL deliverable files to the /out/ directory
- Create a /out/progress.log file and append status updates to it
- Common deliverable formats: .md, .txt, .csv, .json
- When done, ensure all files are in /out/
- Do NOT ask interactive questions — work autonomously with the information provided" \
  >> "$PROGRESS" 2>&1 || {
    EXIT_CODE=$?
    log "agent exited with code $EXIT_CODE"
    # Still check if deliverables were produced despite non-zero exit
    if ls /out/*.md /out/*.txt /out/*.csv /out/*.json /out/*.html 2>/dev/null | head -1 > /dev/null 2>&1; then
      log "deliverables found despite error, marking success"
      exit 0
    fi
    exit $EXIT_CODE
  }

log "done"
exit 0
