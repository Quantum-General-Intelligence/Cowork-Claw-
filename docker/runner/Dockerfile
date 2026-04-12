# syntax=docker/dockerfile:1.6
FROM debian:stable-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=22 \
    PNPM_HOME=/usr/local/pnpm \
    PATH=/usr/local/pnpm:/usr/local/bin:/usr/bin:/bin

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq python3 python3-pip unzip \
 && rm -rf /var/lib/apt/lists/*

# Node 22 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# Claude Code CLI (the primary execution engine)
RUN npm install -g @anthropic-ai/claude-code

# Other agent CLIs kept as optional tools. Pin versions when any of these break.
# If a CLI install fails, comment it out rather than blocking the image build.
RUN npm install -g @openai/codex || true
RUN npm install -g @github/copilot-cli || true
RUN npm install -g cursor-cli || true
RUN npm install -g @google/gemini-cli || true
RUN npm install -g opencode-cli || true

WORKDIR /work
VOLUME ["/out"]

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
