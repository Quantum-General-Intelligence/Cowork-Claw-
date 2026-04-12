# P2 — Infra Reconfig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-host Postgres on the VPS (replacing Neon), wire Drizzle migrations + template seeding into a boot-time one-shot, add `MAX_CONCURRENT_SANDBOXES` and SSH env vars into the runtime, and finalize Cloudflare DNS in front of the existing Traefik + LetsEncrypt proxy so the launch URL `cowork-claw.ai` is ready.

**Architecture:** The repo already has `docker-compose.prod.yml` with Traefik-labeled services (`cowork-claw` on `:3000`, `cowork-claw-site` on `:4321`) using LetsEncrypt. P2 adds a `postgres` service, a `db-migrate` one-shot, and updates env wiring — it does NOT replace Traefik with Cloudflare. Cloudflare sits in front as DNS proxy; TLS termination stays on the VPS via Traefik + LetsEncrypt (that stack is already battle-tested in the repo and swapping it adds risk with no benefit for tomorrow).

**Tech Stack:** Docker Compose, Postgres 16, Drizzle ORM, Traefik (existing), Cloudflare DNS (no proxy or gray-clouded depending on §Task 8), `tsx`.

**Parent spec:** [docs/superpowers/specs/2026-04-12-cowork-claw-office-cowork-launch-design.md](../specs/2026-04-12-cowork-claw-office-cowork-launch-design.md)

**Depends on:** P1 ([2026-04-12-p1-sandbox-migration.md](2026-04-12-p1-sandbox-migration.md)) should be complete or at least merged before running the full P2 smoke tests, because P2 Task 11 expects `getSandboxProvider()` to return the hardened docker provider. You can execute P2 Tasks 1–8 in parallel with P1 — only Task 9+ depend on P1 being merged.

**Prerequisite (operator action, before Task 1):**
- VPS reachable by SSH as the deploy user
- Traefik is already running on the VPS (per existing `docker-compose.prod.yml`)
- Domains `cowork-claw.ai`, `www.cowork-claw.ai`, `app.cowork-claw.ai` are owned and Cloudflare DNS is available to edit
- `/var/lib/cowork-pg/` directory exists on the VPS and is owned by the UID the postgres container will run as (default `999`)

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| [docker-compose.prod.yml](../../../docker-compose.prod.yml) | Modify | Add `postgres`, `db-migrate` services; update `cowork-claw` depends_on and env |
| [Dockerfile](../../../Dockerfile) | Modify | Install Drizzle Kit as a runtime dep for the db-migrate stage (OR use a separate migrate image) |
| [scripts/db-migrate-and-seed.ts](../../../scripts/db-migrate-and-seed.ts) | Create | One-shot script that runs Drizzle push + template seed; used by `db-migrate` service |
| [scripts/seed-templates.ts](../../../scripts/seed-templates.ts) | Create | Stub that will be fully populated in P4; for P2 it just upserts a single smoke template so integration tests pass |
| [lib/env.ts](../../../lib/env.ts) | Create or modify | Typed env reader for `POSTGRES_URL`, `SANDBOX_SSH_*`, `MAX_CONCURRENT_SANDBOXES` — fail fast on missing required values |
| [.env.example](../../../.env.example) | Modify | Document the new env vars |
| [app/api/health/route.ts](../../../app/api/health/route.ts) | Modify | Return `{ db, sshToDocker, diskFree }` health shape per spec §8.4 |
| [scripts/smoke/03-health-endpoint.ts](../../../scripts/smoke/03-health-endpoint.ts) | Create | Smoke test: boots compose, curls `/api/health`, asserts shape |
| [scripts/smoke/04-db-migrate.ts](../../../scripts/smoke/04-db-migrate.ts) | Create | Smoke test: runs db-migrate one-shot against a throwaway pg, asserts tables exist |
| [docs/ops/cloudflare-dns.md](../../../docs/ops/cloudflare-dns.md) | Create | 10-line operator runbook for the manual DNS step |

---

## Task 1: Create typed env reader

**Files:**
- Create or modify: `lib/env.ts`

- [ ] **Step 1.1: Check whether `lib/env.ts` exists**

Run: `ls lib/env.ts 2>&1`
Expected: either the file exists or `No such file or directory`. If it exists, read it first and preserve any existing exports; the snippet below is a *new* section appended to whatever's there.

- [ ] **Step 1.2: Write the env reader**

Create `lib/env.ts` (or append to an existing one) with:

```ts
/**
 * Typed runtime env reader.
 *
 * Fails fast on missing required values so we notice misconfiguration at boot,
 * not mid-task. Call `requireEnv()` once at app start (e.g., in a server-only
 * module) to surface errors loudly.
 */

export interface RuntimeEnv {
  /** Full Postgres connection string. Required. */
  POSTGRES_URL: string

  /** SSH host for the docker runner (may be localhost when Next and dockerd share a VPS). Required. */
  SANDBOX_SSH_HOST: string
  SANDBOX_SSH_PORT: number
  SANDBOX_SSH_USER: string
  /** Base64-encoded PEM private key. Required. */
  SANDBOX_SSH_KEY: string

  /** Hard cap on concurrent runner containers across all tiers. Default 8. */
  MAX_CONCURRENT_SANDBOXES: number

  /** Host directory mounted into runners at /out. Default /var/lib/cowork-artifacts. */
  ARTIFACT_ROOT: string
}

class MissingEnvError extends Error {
  constructor(key: string) {
    super('Missing required env: ' + key)
    this.name = 'MissingEnvError'
  }
}

function readString(key: string, required: true): string
function readString(key: string, required: false, fallback: string): string
function readString(key: string, required: boolean, fallback?: string): string {
  const v = process.env[key]
  if (v && v.length > 0) return v
  if (required) throw new MissingEnvError(key)
  return fallback!
}

function readInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

let cached: RuntimeEnv | null = null

export function getEnv(): RuntimeEnv {
  if (cached) return cached
  cached = {
    POSTGRES_URL: readString('POSTGRES_URL', true),
    SANDBOX_SSH_HOST: readString('SANDBOX_SSH_HOST', true),
    SANDBOX_SSH_PORT: readInt('SANDBOX_SSH_PORT', 22),
    SANDBOX_SSH_USER: readString('SANDBOX_SSH_USER', false, 'root'),
    SANDBOX_SSH_KEY: readString('SANDBOX_SSH_KEY', true),
    MAX_CONCURRENT_SANDBOXES: readInt('MAX_CONCURRENT_SANDBOXES', 8),
    ARTIFACT_ROOT: readString('ARTIFACT_ROOT', false, '/var/lib/cowork-artifacts'),
  }
  return cached
}

/** Call from a server-only module at startup to surface missing-env errors early. */
export function requireEnv(): void {
  getEnv()
}
```

- [ ] **Step 1.3: Write the test**

Create `scripts/smoke/05-env-reader.ts`:

```ts
import { getEnv } from '../../lib/env'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

// Set only the required vars.
process.env.POSTGRES_URL = 'postgres://test:test@localhost/test'
process.env.SANDBOX_SSH_HOST = 'example.test'
process.env.SANDBOX_SSH_KEY = 'Zm9v'

// Clear the module cache so getEnv re-reads.
delete require.cache[require.resolve('../../lib/env')]

const env = getEnv()
assert(env.POSTGRES_URL.startsWith('postgres://'), 'POSTGRES_URL read')
assert(env.SANDBOX_SSH_PORT === 22, 'SANDBOX_SSH_PORT defaults to 22')
assert(env.SANDBOX_SSH_USER === 'root', 'SANDBOX_SSH_USER defaults to root')
assert(env.MAX_CONCURRENT_SANDBOXES === 8, 'MAX_CONCURRENT_SANDBOXES defaults to 8')
assert(env.ARTIFACT_ROOT === '/var/lib/cowork-artifacts', 'ARTIFACT_ROOT default')

console.log('PASS scripts/smoke/05-env-reader.ts')
```

- [ ] **Step 1.4: Run the test**

Run: `pnpm exec tsx scripts/smoke/05-env-reader.ts`
Expected: `PASS scripts/smoke/05-env-reader.ts`

- [ ] **Step 1.5: Commit**

```bash
git add lib/env.ts scripts/smoke/05-env-reader.ts
git commit -m "feat(env): typed runtime env reader with fail-fast required checks"
```

---

## Task 2: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 2.1: Read the current `.env.example` (if any)**

Run: `cat .env.example 2>&1 || echo MISSING`
If it exists, append the new block below to it. If it's MISSING, create it with just the block below.

- [ ] **Step 2.2: Add the new env block**

Append (or create) `.env.example` with this block:

```
# --- Database (self-hosted postgres in docker-compose) ---
POSTGRES_URL=postgres://cowork:cowork@postgres:5432/cowork

# --- Sandbox / docker runner ---
SANDBOX_SSH_HOST=127.0.0.1
SANDBOX_SSH_PORT=22
SANDBOX_SSH_USER=deploy
# Base64-encoded PEM (generate with: base64 -w0 ~/.ssh/cowork_deploy)
SANDBOX_SSH_KEY=
# Hard cap on concurrent runner containers across all tiers
MAX_CONCURRENT_SANDBOXES=8
# Host directory mounted into runners at /out
ARTIFACT_ROOT=/var/lib/cowork-artifacts
```

- [ ] **Step 2.3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document POSTGRES_URL, SANDBOX_SSH_*, MAX_CONCURRENT_SANDBOXES, ARTIFACT_ROOT"
```

---

## Task 3: Add postgres service to `docker-compose.prod.yml`

**Files:**
- Modify: `docker-compose.prod.yml`

- [ ] **Step 3.1: Replace the compose file**

Open `docker-compose.prod.yml`. You need to add a `postgres` service and wire `cowork-claw` to depend on it. Replace the entire file contents with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cowork
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-cowork}
      POSTGRES_DB: cowork
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - /var/lib/cowork-pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cowork -d cowork']
      interval: 5s
      timeout: 3s
      retries: 10
    # Host networking chosen to match the rest of the stack; postgres binds to 127.0.0.1
    # via the PG listener config below. If you prefer a bridge network, remove network_mode
    # and expose port 5432 to the cowork-claw service only.
    network_mode: host
    command:
      - postgres
      - -c
      - listen_addresses=127.0.0.1
      - -c
      - max_connections=200
      - -c
      - shared_buffers=256MB

  db-migrate:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env.local
    network_mode: host
    restart: 'no'
    # Runs migrations + template seed then exits. The cowork-claw service depends on this completing.
    command: ['node', '--enable-source-maps', 'scripts/db-migrate-and-seed.js']

  cowork-claw:
    build: .
    restart: unless-stopped
    env_file: .env.local
    network_mode: host
    depends_on:
      postgres:
        condition: service_healthy
      db-migrate:
        condition: service_completed_successfully
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.cowork-claw.rule=Host(`app.cowork-claw.ai`)'
      - 'traefik.http.routers.cowork-claw.entrypoints=websecure'
      - 'traefik.http.routers.cowork-claw.tls.certresolver=letsencrypt'
      - 'traefik.http.services.cowork-claw.loadbalancer.server.url=http://127.0.0.1:3000'

  cowork-claw-site:
    build: ./site
    restart: unless-stopped
    network_mode: host
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.site.rule=Host(`cowork-claw.ai`) || Host(`www.cowork-claw.ai`)'
      - 'traefik.http.routers.site.entrypoints=websecure'
      - 'traefik.http.routers.site.tls.certresolver=letsencrypt'
      - 'traefik.http.services.site.loadbalancer.server.url=http://127.0.0.1:4321'
```

- [ ] **Step 3.2: Validate the compose file syntax**

Run: `docker compose -f docker-compose.prod.yml config > /dev/null && echo OK`
Expected: `OK`. If it fails, fix the YAML and re-run.

- [ ] **Step 3.3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(compose): add postgres + db-migrate services"
```

---

## Task 4: Create the db-migrate-and-seed script

**Files:**
- Create: `scripts/db-migrate-and-seed.ts`
- Create: `scripts/seed-templates.ts`

- [ ] **Step 4.1: Write the seed stub**

Create `scripts/seed-templates.ts`:

```ts
/**
 * Template seed stub. P4 will replace this with the full 10-template seed.
 * For P2 we upsert a single 'smoke' template so integration tests have something
 * to assert on.
 */
import 'dotenv/config'
import postgres from 'postgres'

export async function seedTemplates(): Promise<void> {
  const sql = postgres(process.env.POSTGRES_URL!, { max: 1 })
  try {
    // Idempotent upsert — assumes the workflow_templates table exists (P3 creates it).
    // For P2, skip silently if the table is absent.
    const exists = await sql`
      SELECT to_regclass('public.workflow_templates') AS t
    `
    if (!exists[0].t) {
      console.log('seed-templates: workflow_templates table not present yet, skipping')
      return
    }
    await sql`
      INSERT INTO workflow_templates (slug, name, description, category, icon, agent_team_json, default_prompt, params_schema)
      VALUES (
        'smoke',
        'Smoke Test Template',
        'Used by integration tests. Do not delete.',
        'system',
        'wrench',
        '[]'::jsonb,
        'smoke',
        '{}'::jsonb
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
    `
    console.log('seed-templates: upserted smoke template')
  } finally {
    await sql.end()
  }
}

if (require.main === module) {
  seedTemplates().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 4.2: Write the migrate-and-seed orchestrator**

Create `scripts/db-migrate-and-seed.ts`:

```ts
/**
 * One-shot runner for the db-migrate compose service.
 *
 * 1. Runs Drizzle push to sync the schema.
 * 2. Runs the template seed.
 *
 * Drizzle Kit is used programmatically via its CLI. For a production-grade
 * setup we'd use drizzle-kit migrate with generated SQL files, but for tomorrow
 * `drizzle-kit push --config` is sufficient and matches the existing dev flow
 * in package.json.
 */
import 'dotenv/config'
import { spawnSync } from 'child_process'
import { seedTemplates } from './seed-templates'

async function main() {
  console.log('[db-migrate] running drizzle-kit push')
  const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    console.error('[db-migrate] drizzle push failed')
    process.exit(result.status ?? 1)
  }
  console.log('[db-migrate] seeding templates')
  await seedTemplates()
  console.log('[db-migrate] done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4.3: Run type-check**

Run: `pnpm type-check`
Expected: passes. If `postgres` import fails, it should already be in deps (lockfile has `postgres: ^3.4.8`).

- [ ] **Step 4.4: Commit**

```bash
git add scripts/db-migrate-and-seed.ts scripts/seed-templates.ts
git commit -m "feat(db): one-shot migrate + template seed script for docker-compose"
```

---

## Task 5: Bake migrate tooling into the Docker image

**Files:**
- Modify: `Dockerfile`

The current Dockerfile uses Next.js standalone output which does NOT include `drizzle-kit` or the `scripts/` directory. We need the `db-migrate` service to have access to them. Simplest fix: add a dedicated stage that keeps the full node_modules + the scripts directory.

- [ ] **Step 5.1: Rewrite the Dockerfile**

Replace the entire `Dockerfile` with:

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Runner stage — slim, production-only.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# db-migrate needs the scripts dir, drizzle config, schema, and full node_modules.
# Copy them alongside the standalone output; they add ~200MB but simplify the compose story.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib/db ./lib/db
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

Note: the `db-migrate` compose service overrides `CMD` to run `scripts/db-migrate-and-seed.js`. Because that file is `.ts`, we need to run it via `tsx`. Adjust the compose `command` in Task 3's output to:

```yaml
    command: ['pnpm', 'exec', 'tsx', 'scripts/db-migrate-and-seed.ts']
```

- [ ] **Step 5.2: Fix the compose `command` for db-migrate**

Open `docker-compose.prod.yml` and change the `db-migrate.command` line from `['node', '--enable-source-maps', 'scripts/db-migrate-and-seed.js']` to `['pnpm', 'exec', 'tsx', 'scripts/db-migrate-and-seed.ts']`.

- [ ] **Step 5.3: Validate**

Run: `docker compose -f docker-compose.prod.yml config > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 5.4: Commit**

```bash
git add Dockerfile docker-compose.prod.yml
git commit -m "feat(docker): include scripts + drizzle tooling in runner image for db-migrate service"
```

---

## Task 6: Update `/api/health` to return `{ db, sshToDocker, diskFree }`

**Files:**
- Modify: `app/api/health/route.ts`

- [ ] **Step 6.1: Read the current health route**

Run: `cat app/api/health/route.ts`
Note what it currently returns so you can preserve any non-overlapping fields.

- [ ] **Step 6.2: Rewrite the health route**

Replace `app/api/health/route.ts` with:

```ts
/**
 * Health endpoint used by the external uptime monitor and by the /api/health
 * line in the preflight checklist. Returns static booleans — no dynamic values,
 * no IDs, no paths, per AGENTS.md.
 */
import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import { countCoworkSandboxes } from '@/lib/sandbox/concurrency'
import { statfsSync } from 'fs'

export const dynamic = 'force-dynamic'

async function checkDb(): Promise<boolean> {
  try {
    const env = getEnv()
    const sql = postgres(env.POSTGRES_URL, { max: 1, connect_timeout: 2 })
    try {
      await sql`SELECT 1`
      return true
    } finally {
      await sql.end({ timeout: 1 })
    }
  } catch {
    return false
  }
}

async function checkSshToDocker(): Promise<boolean> {
  try {
    const env = getEnv()
    const keyPem = Buffer.from(env.SANDBOX_SSH_KEY, 'base64').toString('utf-8')
    // countCoworkSandboxes is a cheap SSH round-trip; if it succeeds, dockerd is reachable.
    await countCoworkSandboxes({
      host: env.SANDBOX_SSH_HOST,
      port: env.SANDBOX_SSH_PORT,
      username: env.SANDBOX_SSH_USER,
      privateKey: keyPem,
    })
    return true
  } catch {
    return false
  }
}

function checkDiskFree(): boolean {
  try {
    const env = getEnv()
    const stats = statfsSync(env.ARTIFACT_ROOT)
    const freeBytes = Number(stats.bavail) * Number(stats.bsize)
    // Require at least 2GB free to consider ourselves healthy.
    return freeBytes > 2 * 1024 * 1024 * 1024
  } catch {
    return false
  }
}

export async function GET() {
  const [db, sshToDocker] = await Promise.all([checkDb(), checkSshToDocker()])
  const diskFree = checkDiskFree()
  const ok = db && sshToDocker && diskFree
  return NextResponse.json(
    { ok, db, sshToDocker, diskFree },
    { status: ok ? 200 : 503 },
  )
}
```

- [ ] **Step 6.3: Run type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: passes. If `@/lib/env` resolution fails, check `tsconfig.json` baseUrl — the repo already uses `@/` for app imports per the existing code.

- [ ] **Step 6.4: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat(health): return { db, sshToDocker, diskFree } per spec §8.4"
```

---

## Task 7: Smoke test — health endpoint

**Files:**
- Create: `scripts/smoke/03-health-endpoint.ts`

- [ ] **Step 7.1: Write the smoke test**

Create `scripts/smoke/03-health-endpoint.ts`:

```ts
/**
 * Smoke test 3: /api/health endpoint shape.
 *
 * Starts the app in production mode against a local compose stack (postgres
 * already running, SSH reachable), hits /api/health, and asserts the response
 * shape and HTTP code.
 *
 * Prerequisites:
 *   - docker compose -f docker-compose.prod.yml up -d postgres
 *   - pnpm build && pnpm start (on :3000) in another terminal, OR
 *   - run the test against the deployed VPS via HEALTH_URL=https://app.cowork-claw.ai/api/health
 */
import 'dotenv/config'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

async function main() {
  const url = process.env.HEALTH_URL || 'http://127.0.0.1:3000/api/health'
  console.log('GET', url)
  const res = await fetch(url)
  const body = (await res.json()) as {
    ok: boolean
    db: boolean
    sshToDocker: boolean
    diskFree: boolean
  }

  assert(typeof body.ok === 'boolean', 'ok is boolean')
  assert(typeof body.db === 'boolean', 'db is boolean')
  assert(typeof body.sshToDocker === 'boolean', 'sshToDocker is boolean')
  assert(typeof body.diskFree === 'boolean', 'diskFree is boolean')
  assert(res.status === 200 || res.status === 503, 'status is 200 or 503')
  assert(body.ok === (body.db && body.sshToDocker && body.diskFree), 'ok is AND of the three')

  console.log('PASS scripts/smoke/03-health-endpoint.ts')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

- [ ] **Step 7.2: Commit**

```bash
git add scripts/smoke/03-health-endpoint.ts
git commit -m "test(health): smoke test 3 — health endpoint shape"
```

(The smoke test itself is run in Task 11 after the full compose stack is up.)

---

## Task 8: Cloudflare DNS runbook (docs-only; manual step)

**Files:**
- Create: `docs/ops/cloudflare-dns.md`

- [ ] **Step 8.1: Write the runbook**

Create `docs/ops/cloudflare-dns.md`:

```markdown
# Cloudflare DNS wiring for launch

This is a manual operator task, not code. Complete it at least 30 minutes before the launch post so propagation settles.

## What already works

- Traefik is terminating TLS on the VPS with LetsEncrypt (see `docker-compose.prod.yml`).
- The existing labels route three hostnames: `cowork-claw.ai`, `www.cowork-claw.ai`, `app.cowork-claw.ai`.

## What you do

1. In Cloudflare, for the zone `cowork-claw.ai`, set four A records pointing at your VPS IP (replace `203.0.113.10` with the real IP):

   | Name | Type | Content | Proxy |
   |---|---|---|---|
   | `@` | A | 203.0.113.10 | **DNS only (grey cloud)** |
   | `www` | A | 203.0.113.10 | **DNS only (grey cloud)** |
   | `app` | A | 203.0.113.10 | **DNS only (grey cloud)** |
   | `api` | A | 203.0.113.10 | **DNS only (grey cloud)** (reserved for v2) |

2. **Do NOT enable the Cloudflare orange-cloud proxy** on these records for the first launch. Reasons:
   - Traefik is already issuing LetsEncrypt certs via HTTP-01 challenge, which requires port 80 reach the VPS directly. Orange-clouding breaks this unless you switch to Full (strict) TLS with an origin cert.
   - Cloudflare rate-limiting can be configured post-launch as a cushion; adding it before launch is premature.

3. Verify:

   ```sh
   dig +short app.cowork-claw.ai
   dig +short cowork-claw.ai
   ```

   Both should return the VPS IP.

4. Watch Traefik's ACME logs when you first boot:

   ```sh
   docker logs -f traefik 2>&1 | grep -i acme
   ```

   First-time cert issuance takes ~30 seconds. If you see rate-limit errors from LetsEncrypt (`too many certificates already issued`), wait and retry — do not keep hammering.

## Rollback

If DNS needs to be reverted (e.g., aborted launch), simply change the A records back to the previous IPs. No code change needed.

## Post-launch upgrades (v2, not tomorrow)

- Turn on orange-cloud with Full (strict), using a Cloudflare origin cert installed in Traefik
- Add Cloudflare rate-limit rules on `/api/tasks`
- Enable Cloudflare BotID / Turnstile on onboarding
```

- [ ] **Step 8.2: Commit**

```bash
git add docs/ops/cloudflare-dns.md
git commit -m "docs(ops): Cloudflare DNS wiring runbook (grey cloud for launch)"
```

---

## Task 9: Integration test — db-migrate one-shot against a throwaway postgres

**Files:**
- Create: `scripts/smoke/04-db-migrate.ts`

- [ ] **Step 9.1: Write the integration test**

Create `scripts/smoke/04-db-migrate.ts`:

```ts
/**
 * Smoke test 4: db-migrate one-shot.
 *
 * Boots a throwaway postgres via `docker run`, points POSTGRES_URL at it,
 * runs the migrate-and-seed script, asserts expected tables + seed rows exist,
 * then tears the container down.
 *
 * Run with: pnpm exec tsx scripts/smoke/04-db-migrate.ts
 */
import 'dotenv/config'
import { spawnSync } from 'child_process'
import postgres from 'postgres'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

function sh(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf-8' })
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
}

async function main() {
  const name = 'cowork-p2-smoke-pg-' + Date.now()
  const port = '55555'
  const dbUrl = `postgres://cowork:cowork@127.0.0.1:${port}/cowork`

  console.log('Starting throwaway postgres...')
  const start = sh('docker', [
    'run', '-d', '--rm',
    '--name', name,
    '-e', 'POSTGRES_USER=cowork',
    '-e', 'POSTGRES_PASSWORD=cowork',
    '-e', 'POSTGRES_DB=cowork',
    '-p', `${port}:5432`,
    'postgres:16-alpine',
  ])
  if (start.code !== 0) {
    console.error('FAIL: could not start postgres:', start.stderr)
    process.exit(1)
  }

  try {
    // Wait for pg to be ready.
    for (let i = 0; i < 30; i++) {
      const check = sh('docker', ['exec', name, 'pg_isready', '-U', 'cowork', '-d', 'cowork'])
      if (check.code === 0) break
      await new Promise((r) => setTimeout(r, 1000))
    }

    console.log('Running migrate-and-seed...')
    const migrate = spawnSync('pnpm', ['exec', 'tsx', 'scripts/db-migrate-and-seed.ts'], {
      stdio: 'inherit',
      env: { ...process.env, POSTGRES_URL: dbUrl },
    })
    assert(migrate.status === 0, 'migrate-and-seed exits 0')

    // Connect and assert the users table exists (created by the existing schema).
    const sql = postgres(dbUrl, { max: 1 })
    try {
      const users = await sql`SELECT to_regclass('public.users') AS t`
      assert(users[0].t !== null, 'public.users table exists after migrate')
      // workflow_templates may or may not exist depending on whether P3 has merged.
      // If it does, the seed should have upserted one row.
      const tmpl = await sql`SELECT to_regclass('public.workflow_templates') AS t`
      if (tmpl[0].t) {
        const rows = await sql`SELECT slug FROM workflow_templates WHERE slug = 'smoke'`
        assert(rows.length === 1, 'smoke template seeded')
      }
    } finally {
      await sql.end()
    }

    console.log('PASS scripts/smoke/04-db-migrate.ts')
  } finally {
    console.log('Stopping throwaway postgres...')
    sh('docker', ['stop', name])
  }
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

- [ ] **Step 9.2: Run the test**

Run: `pnpm exec tsx scripts/smoke/04-db-migrate.ts`
Expected: `PASS scripts/smoke/04-db-migrate.ts`. If docker isn't available locally, skip and run it on the VPS during deploy verification.

- [ ] **Step 9.3: Commit**

```bash
git add scripts/smoke/04-db-migrate.ts
git commit -m "test(db): smoke test 4 — db-migrate one-shot against throwaway postgres"
```

---

## Task 10: Aggregate the P2 smoke script

**Files:**
- Modify: `package.json`

- [ ] **Step 10.1: Add the aggregated script**

Open `package.json`, find the `"scripts"` section, add:

```json
"smoke:p2": "tsx scripts/smoke/05-env-reader.ts && tsx scripts/smoke/04-db-migrate.ts",
```

Note: smoke test 3 (health endpoint) requires a running app and is NOT part of `smoke:p2` — it's run manually in Task 11 and during the preflight checklist.

- [ ] **Step 10.2: Commit**

```bash
git add package.json
git commit -m "chore(scripts): add smoke:p2 aggregated test command"
```

---

## Task 11: Full-stack dry run on the VPS

This task is manual — the operator runs it against the real VPS. No new code.

- [ ] **Step 11.1: Push the branch to the VPS and build**

```sh
ssh deploy@vps 'cd /srv/cowork-claw && git fetch && git checkout <branch>'
ssh deploy@vps 'cd /srv/cowork-claw && docker compose -f docker-compose.prod.yml build'
```

- [ ] **Step 11.2: Boot postgres first, verify, then boot the rest**

```sh
ssh deploy@vps 'cd /srv/cowork-claw && docker compose -f docker-compose.prod.yml up -d postgres'
ssh deploy@vps 'docker compose -f docker-compose.prod.yml ps postgres'
```

Expected: postgres is `healthy`.

- [ ] **Step 11.3: Run the db-migrate one-shot**

```sh
ssh deploy@vps 'cd /srv/cowork-claw && docker compose -f docker-compose.prod.yml run --rm db-migrate'
```

Expected: exits 0 with `[db-migrate] done`.

- [ ] **Step 11.4: Boot the rest of the stack**

```sh
ssh deploy@vps 'cd /srv/cowork-claw && docker compose -f docker-compose.prod.yml up -d cowork-claw cowork-claw-site'
```

- [ ] **Step 11.5: Hit `/api/health` through the real domain**

```sh
curl -s https://app.cowork-claw.ai/api/health | jq
```

Expected: JSON with `{ ok: true, db: true, sshToDocker: true, diskFree: true }` and HTTP 200.

- [ ] **Step 11.6: Run the health smoke test against the real URL**

```sh
HEALTH_URL=https://app.cowork-claw.ai/api/health pnpm exec tsx scripts/smoke/03-health-endpoint.ts
```

Expected: `PASS scripts/smoke/03-health-endpoint.ts`.

**No commit for this task — it's a verification step.**

---

## P2 Completion Criteria

- [ ] `docker compose -f docker-compose.prod.yml config` parses without errors
- [ ] `postgres` service boots and reports healthy
- [ ] `db-migrate` one-shot exits 0 and creates the schema on a fresh database
- [ ] `/api/health` returns `{ ok: true, db: true, sshToDocker: true, diskFree: true }` when everything is green
- [ ] `pnpm type-check && pnpm lint && pnpm build && pnpm smoke:p2` all pass
- [ ] Cloudflare A records are set (operator verification per `docs/ops/cloudflare-dns.md`)
- [ ] `curl https://app.cowork-claw.ai/api/health` returns 200 from a public network

When all boxes are checked, P2 is done and you can proceed to P3 (data model + BYO-key onboarding).
