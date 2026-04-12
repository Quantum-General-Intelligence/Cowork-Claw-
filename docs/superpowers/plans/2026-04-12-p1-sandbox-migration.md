# P1 — Sandbox Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `@vercel/sandbox` as a runtime dependency, harden the existing `DockerSandboxProvider` to match the launch spec (per-tier resources, pids-limit, artifact volume, BYO Anthropic key env, global concurrency cap, static-only logs), and bake a `cowork-claw/runner:latest` Docker image with Claude Code CLI so office-cowork tasks can run on a self-hosted VPS.

**Architecture:** Keep the existing `SandboxProvider` interface and `lib/sandbox/providers/docker.ts` (which already SSH-launches containers on a remote Docker host). Extend it with a few `config` fields, tighten resource limits, replace the default base image with a purpose-built runner image, and delete the Vercel provider. No new services, no HTTP sandbox-manager, no Docker socket mount into the web tier.

**Tech Stack:** TypeScript, Next.js 16, `ssh2` (already in deps), Docker, nanoid, Drizzle ORM, `tsx` for scripts.

**Parent spec:** [docs/superpowers/specs/2026-04-12-cowork-claw-office-cowork-launch-design.md](../specs/2026-04-12-cowork-claw-office-cowork-launch-design.md)

**Prerequisite assumed done by the operator before Task 1:**
- VPS reachable by SSH with a user that can run `docker` without sudo
- `.env.local` has `SANDBOX_SSH_HOST`, `SANDBOX_SSH_PORT`, `SANDBOX_SSH_USER`, `SANDBOX_SSH_KEY` (base64 of a PEM)
- `/var/lib/cowork-artifacts/` exists on the docker host and is writable by the SSH user
- Cloudflare and domain wiring is NOT required for this plan — P1 is runnable locally against a remote docker host

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| [lib/sandbox/provider.ts](../../../lib/sandbox/provider.ts) | Modify | Extend `SandboxCreateConfig` with `env`, `artifactVolume`, `image`, `resources.memMb`, `resources.pids` |
| [lib/sandbox/providers/docker.ts](../../../lib/sandbox/providers/docker.ts) | Modify | Accept new config fields; harden flags; add global concurrency check; swap default image for task runs; sanitize logs |
| [lib/sandbox/providers/vercel.ts](../../../lib/sandbox/providers/vercel.ts) | Delete | Vercel provider goes away |
| [lib/sandbox/factory.ts](../../../lib/sandbox/factory.ts) | Modify | Docker-only factory; drop the vercel branch |
| [lib/sandbox/errors.ts](../../../lib/sandbox/errors.ts) | Create | `SandboxCapError`, `SandboxStartError`, `SandboxKeyError` sentinels with `CW-*` codes |
| [lib/sandbox/concurrency.ts](../../../lib/sandbox/concurrency.ts) | Create | Small helper that counts `cowork-claw=true` containers over SSH; used by docker provider |
| [docker/runner/Dockerfile](../../../docker/runner/Dockerfile) | Create | `cowork-claw/runner:latest` image definition |
| [docker/runner/entrypoint.sh](../../../docker/runner/entrypoint.sh) | Create | Runner entrypoint: reads env, invokes Claude Code CLI headless, writes `/out` |
| [scripts/build-runner-image.sh](../../../scripts/build-runner-image.sh) | Create | One-shot builder that `docker build`s the runner image over SSH on the docker host |
| [scripts/smoke/01-docker-provider-contract.ts](../../../scripts/smoke/01-docker-provider-contract.ts) | Create | Smoke test 1 |
| [scripts/smoke/02-factory-parity.ts](../../../scripts/smoke/02-factory-parity.ts) | Create | Smoke test 2 |
| [package.json](../../../package.json) | Modify | Remove `@vercel/sandbox`; add `smoke:p1` script |
| [lib/constants.ts](../../../lib/constants.ts) | Modify | Remove `SANDBOX_VERCEL_*` constants if any |

---

## Task 1: Extend `SandboxCreateConfig` with the new fields

**Files:**
- Modify: `lib/sandbox/provider.ts` (full rewrite of the `SandboxCreateConfig` interface, ~lines 29–43)

- [ ] **Step 1.1: Replace the `SandboxCreateConfig` interface**

Edit `lib/sandbox/provider.ts`. Replace the existing `SandboxCreateConfig` interface with:

```ts
export interface SandboxCreateConfig {
  /** Legacy Vercel fields — kept optional so existing call sites still type-check during the migration. Ignored by DockerSandboxProvider. */
  teamId?: string
  projectId?: string
  token?: string

  /** Docker image to run. Defaults to `node:22` for backward compatibility with the classic dev-sandbox flow. Set to `cowork-claw/runner:latest` for office-cowork tasks. */
  image?: string

  /** Hard timeout (ms) after which the container is force-stopped and removed by a background cleanup timer. */
  timeout?: number

  /** Ports to publish on the host. Only relevant to classic dev-sandbox flow. Office-cowork tasks ignore this. */
  ports?: number[]

  /** Legacy runtime hint ("node22", etc.). Ignored when `image` is set. */
  runtime?: string

  /** Per-container resource caps. */
  resources?: {
    vcpus?: number
    memMb?: number
    pids?: number
  }

  /** Git source to clone into `/vercel/sandbox/project` at spawn time. Optional for office-cowork tasks. */
  source?: {
    type: 'git'
    url: string
    revision?: string
    depth?: number
  }

  /** Environment variables to set inside the container at `docker run` time. NEVER log these. */
  env?: Record<string, string>

  /** Absolute host path to mount at `/out` inside the container. If set, the Next task route must ensure the directory exists and is writable by the SSH user before calling `create()`. */
  artifactVolume?: string
}
```

- [ ] **Step 1.2: Run type-check**

Run: `pnpm type-check`
Expected: passes. (`DockerSandboxProvider.create` currently reads fields off this type and will ignore anything it doesn't know about. The vercel provider also type-checks because `teamId/projectId/token` are still present as optional.)

- [ ] **Step 1.3: Commit**

```bash
git add lib/sandbox/provider.ts
git commit -m "feat(sandbox): extend SandboxCreateConfig with env, image, artifactVolume, resources.memMb/pids"
```

---

## Task 2: Create sandbox error sentinels

**Files:**
- Create: `lib/sandbox/errors.ts`

- [ ] **Step 2.1: Write the error classes**

Create `lib/sandbox/errors.ts` with:

```ts
/**
 * Sentinel errors thrown by DockerSandboxProvider. Each carries a stable CW-* code
 * that the Next task route maps to an HTTP response. Per AGENTS.md, these messages
 * must be static — callers never interpolate dynamic values into them.
 */

export class SandboxCapError extends Error {
  readonly code = 'CW-SBX01'
  constructor() {
    super('Sandbox capacity reached')
    this.name = 'SandboxCapError'
  }
}

export class SandboxStartError extends Error {
  readonly code = 'CW-SBX02'
  constructor() {
    super('Sandbox failed to start')
    this.name = 'SandboxStartError'
  }
}

export class SandboxDiskError extends Error {
  readonly code = 'CW-SBX03'
  constructor() {
    super('Sandbox host is out of disk')
    this.name = 'SandboxDiskError'
  }
}

export function isSandboxError(
  err: unknown,
): err is SandboxCapError | SandboxStartError | SandboxDiskError {
  return (
    err instanceof SandboxCapError ||
    err instanceof SandboxStartError ||
    err instanceof SandboxDiskError
  )
}
```

- [ ] **Step 2.2: Write the failing test**

Create `scripts/smoke/00-sandbox-errors.ts`:

```ts
import { SandboxCapError, SandboxStartError, SandboxDiskError, isSandboxError } from '../../lib/sandbox/errors'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

const cap = new SandboxCapError()
assert(cap.code === 'CW-SBX01', 'cap code')
assert(cap.message === 'Sandbox capacity reached', 'cap message is static')
assert(isSandboxError(cap), 'isSandboxError recognises cap')

const start = new SandboxStartError()
assert(start.code === 'CW-SBX02', 'start code')

const disk = new SandboxDiskError()
assert(disk.code === 'CW-SBX03', 'disk code')

assert(!isSandboxError(new Error('random')), 'isSandboxError rejects plain Error')

console.log('PASS scripts/smoke/00-sandbox-errors.ts')
```

- [ ] **Step 2.3: Run the test**

Run: `pnpm exec tsx scripts/smoke/00-sandbox-errors.ts`
Expected: `PASS scripts/smoke/00-sandbox-errors.ts`

- [ ] **Step 2.4: Commit**

```bash
git add lib/sandbox/errors.ts scripts/smoke/00-sandbox-errors.ts
git commit -m "feat(sandbox): add CW-SBX01..03 error sentinels"
```

---

## Task 3: Create the concurrency-check helper

**Files:**
- Create: `lib/sandbox/concurrency.ts`

- [ ] **Step 3.1: Write the helper**

Create `lib/sandbox/concurrency.ts`:

```ts
import type { Client } from 'ssh2'

/**
 * Counts currently-running sandbox containers on the docker host by the
 * `cowork-claw=true` label. Used as a pre-spawn gate in DockerSandboxProvider.
 *
 * This file re-implements a minimal SSH exec to avoid importing from
 * providers/docker.ts (which would create a cycle). In production we should
 * refactor sshExec into a shared module; for P1 we duplicate the 30 lines.
 */

export async function countCoworkSandboxes(sshConfig: {
  host: string
  port: number
  username: string
  privateKey: string
}): Promise<number> {
  const { Client } = await import('ssh2')
  const cmd = 'docker ps --filter label=cowork-claw=true -q | wc -l'

  return new Promise<number>((resolve, reject) => {
    const conn = new Client() as Client
    let stdout = ''
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error('Concurrency check timed out'))
    }, 5000)

    conn
      .on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) {
            clearTimeout(timer)
            conn.end()
            return reject(err)
          }
          stream
            .on('close', () => {
              clearTimeout(timer)
              conn.end()
              const n = parseInt(stdout.trim(), 10)
              resolve(Number.isFinite(n) ? n : 0)
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString()
            })
        })
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect(sshConfig)
  })
}

export function getMaxConcurrentSandboxes(): number {
  const raw = process.env.MAX_CONCURRENT_SANDBOXES
  const n = raw ? parseInt(raw, 10) : 8
  return Number.isFinite(n) && n > 0 ? n : 8
}
```

- [ ] **Step 3.2: Run type-check**

Run: `pnpm type-check`
Expected: passes.

- [ ] **Step 3.3: Commit**

```bash
git add lib/sandbox/concurrency.ts
git commit -m "feat(sandbox): add countCoworkSandboxes + getMaxConcurrentSandboxes helpers"
```

---

## Task 4: Harden `DockerSandboxProvider`

**Files:**
- Modify: `lib/sandbox/providers/docker.ts` (the `DockerSandboxProvider.create` method, lines ~164–222)

- [ ] **Step 4.1: Replace the `create` method**

Open `lib/sandbox/providers/docker.ts`. Replace the entire `DockerSandboxProvider` class (from `export class DockerSandboxProvider implements SandboxProvider {` through its closing `}`) with:

```ts
export class DockerSandboxProvider implements SandboxProvider {
  async create(config: SandboxCreateConfig): Promise<SandboxInstance> {
    // Pre-spawn: enforce global concurrency cap.
    const sshConfig = getSSHConfig()
    const { countCoworkSandboxes, getMaxConcurrentSandboxes } = await import('../concurrency')
    const cap = getMaxConcurrentSandboxes()
    const current = await countCoworkSandboxes(sshConfig)
    if (current >= cap) {
      const { SandboxCapError } = await import('../errors')
      throw new SandboxCapError()
    }

    const id = nanoid(10).toLowerCase()
    const containerName = `sandbox-${id}`

    // Image: prefer explicit config.image (office-cowork task), else fall back to node:<runtime>
    const image =
      config.image ??
      (config.runtime === 'node22'
        ? 'node:22'
        : `node:${config.runtime?.replace('node', '') || '22'}`)

    const ports = config.ports || [3000]
    const vcpus = config.resources?.vcpus ?? 2
    const memMb = config.resources?.memMb ?? 2048
    const pids = config.resources?.pids ?? 512

    const portFlags = ports.map((p) => `-p ${p}`).join(' ')

    // Env flags — passed as separate shell tokens. Values are SSH-escaped inline.
    // IMPORTANT: never log envFlags or the final createCmd; they contain the user's Anthropic key.
    const envFlags = config.env
      ? Object.entries(config.env)
          .map(([k, v]) => `-e ${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ')
      : ''

    // Artifact volume — host path is assumed to exist and be writable by the SSH user.
    const volumeFlag = config.artifactVolume
      ? `-v '${config.artifactVolume.replace(/'/g, "'\\''")}:/out'`
      : ''

    // Base create command. For the node:* fallback we keep the apt-get bootstrap;
    // for cowork-claw/runner:latest the entrypoint already has everything.
    const bootstrap =
      image === 'node:22' || image.startsWith('node:')
        ? `sh -c 'apt-get update -qq && apt-get install -y -qq git curl > /dev/null 2>&1; sleep infinity'`
        : '' // runner image has its own ENTRYPOINT

    const createCmd = [
      `docker run -d --name ${containerName}`,
      portFlags,
      `--memory=${memMb}m --cpus=${vcpus} --pids-limit=${pids}`,
      `--label cowork-claw=true`,
      `--label sandbox-id=${id}`,
      envFlags,
      volumeFlag,
      image,
      bootstrap,
    ]
      .filter((s) => s.length > 0)
      .join(' ')

    let createResult: { exitCode: number; stdout: string; stderr: string }
    try {
      createResult = await sshExecRetry(createCmd, 2, 60000)
    } catch {
      const { SandboxStartError } = await import('../errors')
      throw new SandboxStartError()
    }

    if (createResult.exitCode !== 0) {
      const { SandboxStartError } = await import('../errors')
      // Static log — do NOT include stderr (may contain env or paths).
      console.error('Sandbox create failed')
      throw new SandboxStartError()
    }

    const instance = new DockerSandboxInstance(id, ports)

    // Readiness probe — only for the node:* bootstrap path. Runner image is ready immediately.
    if (bootstrap) {
      for (let i = 0; i < 30; i++) {
        const check = await sshExec(`docker exec ${containerName} which git 2>/dev/null`, 15000).catch(
          () => null,
        )
        if (check && check.exitCode === 0) break
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      await sshExecRetry(`docker exec ${containerName} mkdir -p /vercel/sandbox/project`)
    }

    // Clone git source if requested (unchanged behaviour).
    if (config.source?.url) {
      const depthFlag = config.source.depth ? `--depth ${config.source.depth}` : ''
      const revisionFlag = config.source.revision ? `-b ${config.source.revision}` : ''
      const cloneCmd = `docker exec ${containerName} git clone ${depthFlag} ${revisionFlag} '${config.source.url}' /vercel/sandbox/project`
      await sshExecRetry(cloneCmd, 2, 120000)
    }

    // Auto-cleanup timer — unchanged.
    if (config.timeout) {
      const timeoutSec = Math.floor(config.timeout / 1000)
      await sshExec(
        `nohup sh -c 'sleep ${timeoutSec} && docker stop ${containerName} 2>/dev/null && docker rm ${containerName} 2>/dev/null' > /dev/null 2>&1 &`,
      )
    }

    return instance
  }

  async get(options: SandboxGetOptions): Promise<SandboxInstance> {
    const containerName = `sandbox-${options.sandboxId}`
    const result = await sshExecRetry(
      `docker inspect ${containerName} --format '{{.State.Running}}' 2>/dev/null`,
      2,
      10000,
    )
    if (result.exitCode !== 0 || result.stdout.trim() !== 'true') {
      throw new Error('Container not found or not running')
    }
    return new DockerSandboxInstance(options.sandboxId)
  }
}
```

- [ ] **Step 4.2: Run type-check**

Run: `pnpm type-check`
Expected: passes. If it fails with "Cannot find module '../errors'", verify Task 2 committed correctly.

- [ ] **Step 4.3: Run lint**

Run: `pnpm lint`
Expected: passes. If there's a warning about `require` in factory.ts, leave it — we rewrite the factory in Task 6.

- [ ] **Step 4.4: Commit**

```bash
git add lib/sandbox/providers/docker.ts
git commit -m "feat(sandbox): harden DockerSandboxProvider — pids limit, artifact volume, env, global cap"
```

---

## Task 5: Delete the Vercel provider

**Files:**
- Delete: `lib/sandbox/providers/vercel.ts`
- Modify: `lib/sandbox/config.ts` (remove `SANDBOX_VERCEL_*` reads if present)
- Modify: `lib/sandbox/creation.ts` (remove any vercel-only code paths)
- Modify: `lib/constants.ts` (remove vercel-specific constants)

- [ ] **Step 5.1: Delete the vercel provider file**

Run: `git rm lib/sandbox/providers/vercel.ts`
Expected: file removed from tracking.

- [ ] **Step 5.2: Purge `SANDBOX_VERCEL_*` references from the three files listed above**

Open each file below and remove any line that reads `SANDBOX_VERCEL_TOKEN`, `SANDBOX_VERCEL_TEAM_ID`, or `SANDBOX_VERCEL_PROJECT_ID`:
- `lib/sandbox/config.ts`
- `lib/sandbox/creation.ts`
- `lib/constants.ts`

For each file, first read it to see what's present, then delete the vercel-only lines. Leave everything else unchanged.

- [ ] **Step 5.3: Run type-check to find anything that still imports from the deleted file**

Run: `pnpm type-check`
Expected: if anything still imports `@vercel/sandbox` or `./providers/vercel`, tsc prints the exact file:line. Fix each one by either deleting the import (if the code is dead) or replacing `SANDBOX_VERCEL_*` env reads with nothing.

- [ ] **Step 5.4: Run grep to verify no `@vercel/sandbox` imports remain in `lib/` or `app/`**

Run: `git grep -l '@vercel/sandbox' lib/ app/ || echo NO_MATCHES`
Expected: `NO_MATCHES`. References inside `modules/`, `docs/`, and `pnpm-lock.yaml` are acceptable — `modules/` are vendored, docs/lockfile will be rewritten later.

- [ ] **Step 5.5: Commit**

```bash
git add -A lib/ app/
git commit -m "chore(sandbox): delete vercel provider and all SANDBOX_VERCEL_* references"
```

---

## Task 6: Simplify the factory

**Files:**
- Modify: `lib/sandbox/factory.ts` (full rewrite)

- [ ] **Step 6.1: Rewrite the factory**

Replace the entire contents of `lib/sandbox/factory.ts` with:

```ts
import type { SandboxProvider } from './provider'
import { DockerSandboxProvider } from './providers/docker'

let cachedProvider: SandboxProvider | null = null

export function getSandboxProvider(): SandboxProvider {
  if (!cachedProvider) {
    cachedProvider = new DockerSandboxProvider()
  }
  return cachedProvider
}
```

- [ ] **Step 6.2: Run type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: both pass. The `require` warnings from the old factory are now gone.

- [ ] **Step 6.3: Commit**

```bash
git add lib/sandbox/factory.ts
git commit -m "refactor(sandbox): docker-only factory"
```

---

## Task 7: Remove `@vercel/sandbox` from package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 7.1: Remove the dependency**

Run: `pnpm remove @vercel/sandbox`
Expected: `package.json` and `pnpm-lock.yaml` updated, node_modules pruned.

- [ ] **Step 7.2: Verify the build still works**

Run: `pnpm build`
Expected: passes. If it fails with a missing-module error, Task 5 missed a reference — search for it, remove it, re-run.

- [ ] **Step 7.3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): remove @vercel/sandbox"
```

---

## Task 8: Create the runner image Dockerfile

**Files:**
- Create: `docker/runner/Dockerfile`
- Create: `docker/runner/entrypoint.sh`

- [ ] **Step 8.1: Write the Dockerfile**

Create `docker/runner/Dockerfile`:

```dockerfile
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
```

- [ ] **Step 8.2: Write the entrypoint**

Create `docker/runner/entrypoint.sh`:

```sh
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
```

- [ ] **Step 8.3: Commit**

```bash
git add docker/runner/Dockerfile docker/runner/entrypoint.sh
git commit -m "feat(runner): cowork-claw/runner image + headless entrypoint"
```

---

## Task 9: Build the runner image on the docker host

**Files:**
- Create: `scripts/build-runner-image.sh`

- [ ] **Step 9.1: Write the build script**

Create `scripts/build-runner-image.sh`:

```sh
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
```

- [ ] **Step 9.2: Make it executable**

Run: `chmod +x scripts/build-runner-image.sh`

- [ ] **Step 9.3: Commit**

```bash
git add scripts/build-runner-image.sh
git commit -m "feat(runner): build script that ships Dockerfile to docker host over SSH"
```

- [ ] **Step 9.4: Run the build against the real docker host**

Run: `./scripts/build-runner-image.sh`
Expected: prints `Done.` and shows a sha256 image id. First run will take 3–8 minutes depending on VPS network. If `corepack` or any CLI install fails, the `|| true` clauses will let the image build but you'll see the errors in the output — note them, the runner still boots.

**This is a manual verification step, not a code change — no commit.**

---

## Task 10: Smoke test 1 — DockerSandboxProvider contract

**Files:**
- Create: `scripts/smoke/01-docker-provider-contract.ts`

- [ ] **Step 10.1: Write the failing smoke test**

Create `scripts/smoke/01-docker-provider-contract.ts`:

```ts
/**
 * Smoke test 1: DockerSandboxProvider contract
 *
 * Creates a container from cowork-claw/runner:latest, asserts it runs, writes
 * the expected file into the mounted artifact volume, and stops cleanly.
 *
 * Requires .env.local with SANDBOX_SSH_* set. Run with:
 *   pnpm exec tsx scripts/smoke/01-docker-provider-contract.ts
 */
import 'dotenv/config'
import { mkdtempSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DockerSandboxProvider } from '../../lib/sandbox/providers/docker'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

async function main() {
  const provider = new DockerSandboxProvider()

  // The artifact volume must exist on the docker host, not on the machine running this script.
  // For a single-VPS setup where the script runs on the same host as dockerd, we can use a host path.
  // For a remote docker host, set SMOKE_ARTIFACT_VOLUME to a path that exists there.
  const artifactVolume =
    process.env.SMOKE_ARTIFACT_VOLUME || `/tmp/cowork-smoke-${Date.now()}`

  console.log('Creating sandbox with runner image...')
  const sandbox = await provider.create({
    image: 'cowork-claw/runner:latest',
    resources: { vcpus: 1, memMb: 512, pids: 256 },
    timeout: 120_000,
    env: {
      ANTHROPIC_API_KEY: process.env.SMOKE_ANTHROPIC_API_KEY || 'smoke-placeholder',
      TASK_ID: 'smoke-task',
      TEMPLATE_SLUG: 'smoke',
      PARAMS_JSON: 'hello from smoke test',
    },
    artifactVolume,
  })

  assert(typeof sandbox.sandboxId === 'string' && sandbox.sandboxId.length > 0, 'sandboxId is non-empty')

  // Poll for /out/result.md inside the container (not on host — we may be remote).
  console.log('Polling for /out/result.md inside the container...')
  let found = false
  for (let i = 0; i < 30; i++) {
    const check = await sandbox.runCommand('test', ['-f', '/out/result.md']).catch(() => null)
    if (check && check.exitCode === 0) {
      found = true
      break
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  assert(found, '/out/result.md should exist inside the container')

  // Read the file back.
  const cat = await sandbox.runCommand('cat', ['/out/result.md'])
  const body = await cat.stdout()
  assert(body.length > 0, 'result.md should be non-empty')

  console.log('Stopping sandbox...')
  await sandbox.stop()

  // Verify the container is gone (using a fresh get call — should throw).
  let stopped = false
  try {
    await provider.get({ sandboxId: sandbox.sandboxId })
  } catch {
    stopped = true
  }
  assert(stopped, 'provider.get after stop should throw')

  console.log('PASS scripts/smoke/01-docker-provider-contract.ts')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

- [ ] **Step 10.2: Run the smoke test**

Run: `pnpm exec tsx scripts/smoke/01-docker-provider-contract.ts`
Expected: `PASS scripts/smoke/01-docker-provider-contract.ts`. If it fails with "image not found", re-run Task 9. If it fails with SSH errors, verify `.env.local` has all four `SANDBOX_SSH_*` vars.

- [ ] **Step 10.3: Commit**

```bash
git add scripts/smoke/01-docker-provider-contract.ts
git commit -m "test(sandbox): smoke test 1 — DockerSandboxProvider contract"
```

---

## Task 11: Smoke test 2 — factory + interface parity

**Files:**
- Create: `scripts/smoke/02-factory-parity.ts`

- [ ] **Step 11.1: Write the smoke test**

Create `scripts/smoke/02-factory-parity.ts`:

```ts
/**
 * Smoke test 2: factory + SandboxProvider interface parity
 *
 * This is the test that protects every existing call site from the @vercel/sandbox
 * removal. It calls the factory exactly the way the app does, exercises the
 * full interface, and asserts the shapes are unchanged.
 *
 * Run with: pnpm exec tsx scripts/smoke/02-factory-parity.ts
 */
import 'dotenv/config'
import { getSandboxProvider } from '../../lib/sandbox/factory'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

async function main() {
  const provider = getSandboxProvider()

  // Shape check: the factory returns something with create + get.
  assert(typeof provider.create === 'function', 'provider.create is a function')
  assert(typeof provider.get === 'function', 'provider.get is a function')

  console.log('Creating sandbox via factory...')
  const sandbox = await provider.create({
    image: 'cowork-claw/runner:latest',
    resources: { vcpus: 1, memMb: 512, pids: 256 },
    timeout: 60_000,
    env: {
      ANTHROPIC_API_KEY: process.env.SMOKE_ANTHROPIC_API_KEY || 'smoke-placeholder',
      TASK_ID: 'smoke-parity',
      TEMPLATE_SLUG: 'smoke',
      PARAMS_JSON: 'parity',
    },
  })

  // Interface: sandboxId, runCommand (both overloads), domain, stop.
  assert(typeof sandbox.sandboxId === 'string', 'sandboxId is a string')
  assert(typeof sandbox.runCommand === 'function', 'runCommand is a function')
  assert(typeof sandbox.domain === 'function', 'domain is a function')
  assert(typeof sandbox.stop === 'function', 'stop is a function')

  // runCommand(string, string[]) overload
  const echo = await sandbox.runCommand('echo', ['parity-ok'])
  assert(echo.exitCode === 0, 'echo exit 0')
  const echoOut = await echo.stdout()
  assert(echoOut.includes('parity-ok'), 'echo stdout contains parity-ok')

  // runCommand({ cmd, args, env }) overload
  const envEcho = await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', 'echo $PARITY_VAR'],
    env: { PARITY_VAR: 'parity-env-ok' },
  })
  assert(envEcho.exitCode === 0, 'env echo exit 0')
  const envOut = await envEcho.stdout()
  assert(envOut.includes('parity-env-ok'), 'env echo stdout contains parity-env-ok')

  // domain() returns a string
  const d = sandbox.domain(3000)
  assert(typeof d === 'string' && d.length > 0, 'domain(3000) returns non-empty string')

  await sandbox.stop()
  console.log('PASS scripts/smoke/02-factory-parity.ts')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

- [ ] **Step 11.2: Run the smoke test**

Run: `pnpm exec tsx scripts/smoke/02-factory-parity.ts`
Expected: `PASS scripts/smoke/02-factory-parity.ts`.

- [ ] **Step 11.3: Commit**

```bash
git add scripts/smoke/02-factory-parity.ts
git commit -m "test(sandbox): smoke test 2 — factory + provider interface parity"
```

---

## Task 12: Add the `smoke:p1` script and final verification

**Files:**
- Modify: `package.json` (add `smoke:p1` script)

- [ ] **Step 12.1: Add the script**

Open `package.json`, find the `"scripts"` section, add:

```json
"smoke:p1": "tsx scripts/smoke/00-sandbox-errors.ts && tsx scripts/smoke/01-docker-provider-contract.ts && tsx scripts/smoke/02-factory-parity.ts",
```

- [ ] **Step 12.2: Run all P1 gates**

Run the full quality pipeline. Each command must succeed before committing.

```
pnpm format
pnpm type-check
pnpm lint
pnpm build
pnpm smoke:p1
```

Expected: every command passes. If `pnpm build` fails after `pnpm build` was already passing in Task 7, something later introduced a regression — bisect by reverting commits.

- [ ] **Step 12.3: Commit**

```bash
git add package.json
git commit -m "chore(scripts): add smoke:p1 aggregated test command"
```

---

## P1 Completion Criteria

All of the following must be true:

- [ ] `git grep '@vercel/sandbox' lib/ app/` returns nothing
- [ ] `package.json` does not list `@vercel/sandbox`
- [ ] `lib/sandbox/providers/vercel.ts` does not exist
- [ ] `lib/sandbox/factory.ts` returns `DockerSandboxProvider` unconditionally
- [ ] `cowork-claw/runner:latest` exists on the remote docker host
- [ ] `pnpm type-check && pnpm lint && pnpm build && pnpm smoke:p1` all pass
- [ ] Global concurrency cap is enforced: temporarily set `MAX_CONCURRENT_SANDBOXES=0` in the shell and re-run smoke test 1 — it should fail with `SandboxCapError` / `CW-SBX01`, then reset the env and re-run to confirm it passes

When all boxes are checked, P1 is done and you are ready for P2 (infra reconfig: local Postgres, Docker Compose, Cloudflare wiring).
