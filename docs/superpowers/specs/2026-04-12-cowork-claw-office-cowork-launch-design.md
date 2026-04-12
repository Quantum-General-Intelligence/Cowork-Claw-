# Cowork-Claw: Office-Cowork Launch Design

**Date:** 2026-04-12
**Status:** Spec — approved in brainstorming, pending user review before plan
**Target:** Launch tomorrow (2026-04-13), charging real money, off Vercel, on a self-hosted VPS

---

## 1. Summary

Cowork-Claw is an **office-work cowork platform** for founders and solo operators. A user describes a job (a pitch deck, a prospecting pipeline, a proposal, research, etc.), OpenClaw orchestrates a team of AI agents, the team produces the deliverable (a real file the user downloads), and the user pays a flat monthly SaaS fee.

**Positioning:** *"Stop doing office work. Your AI team does it together."*
**Tagline:** *"Cowork meets OpenClaw — for founders."*
**This is not a coding platform.** Claude Code is the execution engine under the hood; the user never sees code.

**Why tomorrow:** the founder has a 2M+ follower personal brand. A single launch post can plausibly drive 5k–50k visits, and we want Stripe collecting monthly subscriptions the moment that post goes live.

**Beachhead:** indie SaaS founders reached via the founder's socials. The product itself is for any knowledge worker, but day-one messaging targets founders.

**Legality posture:** pure BYO-API-key tomorrow. The user pastes their Anthropic API key, we never touch Anthropic billing, we charge a flat SaaS fee for orchestration + sandbox compute + templates. Managed-API with markup is a v2 concern tied to a metering system we are not building tomorrow.

---

## 2. Scope

### 2.1 In scope for tomorrow

- Full migration off `@vercel/sandbox` onto a self-hosted Docker-based sandbox running on a single VPS
- **Harden the existing `DockerSandboxProvider`** ([lib/sandbox/providers/docker.ts](lib/sandbox/providers/docker.ts)) which already implements the `SandboxProvider` interface and speaks SSH to a remote Docker host — no new `sandbox-manager` HTTP service is needed
- A pre-built `cowork-claw/runner:latest` Docker image with Claude Code CLI and the other agent CLIs baked in, replacing the current `node:22` base
- BYO-key onboarding flow (validate + encrypt + store)
- 10 office-cowork templates (see §6.4) surfaced as a "template strip" above the existing chat/task-form landing state
- Local artifact storage on the VPS with signed-URL downloads served by Next.js
- Local Postgres on the VPS (moved off Neon)
- Cloudflare DNS + TLS wiring
- Stripe pricing live: Hobby $19/mo, Pro $49/mo, Studio $129/mo, White-label $399/mo
- Landing page copy rewrite on the Astro `site/`
- Five integration smoke tests + a launch-eve load test

### 2.2 Out of scope for tomorrow (v2 and later)

- Lifetime pricing tiers (deferred to a future partner deal)
- Multi-VPS, per-client VPS segmentation
- Hardened isolation (gVisor / Firecracker microVMs)
- Durable task queue / crash-safe recovery beyond the simple reconciliation in §7.5–7.6
- Autoscale, horizontal scale, load balancer
- Conversational refinement loops (refine = new task only)
- S3/R2 artifact storage
- Egress allowlists / network-namespace sandbox hardening
- Metrics stack (Prometheus / OTel / Loki / Grafana)
- Playwright / Vitest / unit-test suites
- Managed-API tier with per-user markup metering
- Linear / Sentry / PostHog / Discord integrations
- Custom MCP bundles and "your own proven tools" catalog
- Vibe-to-prod deployment templates

### 2.3 Explicitly kept from the existing repo

- Next.js 16 app, Supabase auth, Stripe wiring, middleware paid-gate, OpenClaw chat, workflow builder (xyflow — stays one click deep, not removed), Monaco editor, git diff viewer, MCP connectors UI, multi-agent support (Claude Code, Codex, Copilot, Cursor, Gemini, opencode), `ENCRYPTION_KEY` util, Drizzle schema for users/tasks/keys/connectors.

### 2.4 Explicitly scrapped

- `@vercel/sandbox` package and every import of it
- Neon Postgres in production (replaced with local pg in Docker Compose)
- Any UI or copy that positions Cowork-Claw as a "coding platform"

---

## 3. Architecture

### 3.1 Runtime topology

```
                ┌────────────────────────────────────────────┐
                │            Cloudflare (DNS + TLS)          │
                └──────────────────┬─────────────────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │   Your VPS (1x)   │
                         │  Docker Compose   │
                         └─────────┬─────────┘
                                   │
              ┌────────────────────┴──────────────┐
              │                                   │
     ┌────────▼────────┐               ┌──────────▼────────┐
     │  next-app       │               │   postgres        │
     │  (Next.js 16)   │               │  (local, on VPS)  │
     │  Supabase auth  │               │                   │
     │  Stripe         │               └───────────────────┘
     │  OpenClaw chat  │
     │                 │
     │  DockerSandbox  │ ── SSH ──┐
     │  Provider       │          │
     └────────┬────────┘          │
              │                   ▼
              │         ┌──────────────────────────┐
              │         │ dockerd (same VPS via    │
              │         │  SSH to localhost, OR a  │
              │         │  dedicated docker host)  │
              │         │                          │
              │         │  task-runner-N           │ ← ephemeral
              │         │  (Claude Code CLI + user │    - resource-limited
              │         │   Anthropic key + params │    - auto-destroyed
              │         │   writes to /out volume) │    - --label cowork-claw=true
              │         └──────────────────────────┘
              │
              ▼
       ┌──────────────┐
       │  Anthropic   │  ← user's own API key (BYO),
       │  API         │    passed into the task-runner
       │              │    container at spawn time
       └──────────────┘
```

### 3.2 Architectural decisions

1. **Single VPS, Docker Compose, no Kubernetes.** Tomorrow = one box. Multi-VPS segmentation by client is v2.
2. **Reuse the existing `DockerSandboxProvider`** ([lib/sandbox/providers/docker.ts](lib/sandbox/providers/docker.ts)). It already speaks SSH to a remote Docker host and implements the full `SandboxProvider` interface the rest of the app uses. No separate `sandbox-manager` HTTP service, no Docker socket mounted into the web-facing process — the SSH connection *is* the remote-control channel. This is simpler than a separate service and already written.
3. **Pre-built `task-runner` image**, not per-task image builds. One image ships with all agent CLIs at pinned versions. No auto-updates on launch day. Replaces the current `node:22` default in `docker.ts`.
4. **BYO-key flow** is DB → Next handler → `DockerSandboxProvider.create()` → `docker run -e ANTHROPIC_API_KEY` over SSH. Key never touches disk in the container, never appears in any log.
5. **Local Postgres on the VPS** (not Neon). Removes an external dependency and latency hop. Neon can be re-adopted later if multi-VPS demands it.
6. **Workflow templates are DB seed data** in a new `workflow_templates` table, not hardcoded in TypeScript. Adding templates post-launch is a seed-script run, not a redeploy.
7. **No job queue.** Next handler calls `DockerSandboxProvider.create()` synchronously, then returns a task ID. Progress is streamed by polling `runCommand` output or via a log file the runner writes to `/out`. Crashes mid-task = failed task, user retries.
8. **Concurrency enforcement** happens in the Next task-creation route (it knows the user's tier), plus a global cap enforced by counting containers with `--label cowork-claw=true` before spawning.
9. **Explicit v2 deferrals:** hardened isolation, autoscale, durable queue, multi-VPS, splitting the docker host off to a separate machine.

---

## 4. Inventory: keep / hide / scrap / build

| # | Thing in repo | Action |
|---|---|---|
| 1 | Next.js 16 app (app router) | Keep |
| 2 | Supabase auth + paid-gate middleware | Keep |
| 3 | Stripe checkout + pricing | Keep; add 4 price IDs |
| 4 | Drizzle schema + migrations | Keep; add `workflow_templates`, `task_artifacts` tables |
| 5 | `@vercel/sandbox` + `lib/sandbox/providers/vercel.ts` | **Scrap** |
| 5b | `lib/sandbox/providers/docker.ts` | **Keep & harden** (already exists, already SSH-based — needs per-tier resource caps, pids-limit, `/out` volume, `ANTHROPIC_API_KEY` env, base image swap to `cowork-claw/runner:latest`, global concurrency cap) |
| 5c | `lib/sandbox/factory.ts` | **Simplify** — drop the vercel branch, default to docker unconditionally |
| 6 | Task form + agent picker | Keep; still accessible |
| 7 | Chat with OpenClaw | Keep; primary surface |
| 8 | Workflow builder (xyflow) | Keep; not hidden, remains the "peek under the hood" view |
| 9 | `docker-compose.prod.yml` | Reconfig: add `sandbox-manager`, `postgres`, `db-migrate` services |
| 10 | Astro marketing site `site/` | Reconfig: copy rewrite (hero, pricing, tagline) |
| 11 | Monaco editor + git diff viewer | Keep |
| 12 | LSP / SSH / websocket stack | Keep as-is; not launch-critical |
| 13 | `modules/*` | Keep as-is; not launch-critical |
| 14 | MCP connectors UI | Keep |
| 15 | Multi-agent support (Claude, Codex, Copilot, Cursor, Gemini, opencode) | Keep |

---

## 5. Pricing

| Tier | Price | Seats | Limits |
|---|---|---|---|
| Hobby | $19/mo | 1 | BYO-key, 5 tasks/day, 30min max task, 1 concurrent |
| Pro | $49/mo | 1 | BYO-key, 50 tasks/day, 2h max task, 2 concurrent, priority queue |
| Studio | $129/mo | 3 | Shared task feed, team templates, 3h max task, 3 concurrent |
| White-label | $399/mo | unlimited | Rebrand, custom domain, logo, all templates, 5 concurrent |

**No lifetime tier** anywhere on the pricing page. Lifetimes are a deferred, partner-driven future event and must not appear in day-one marketing.

---

## 6. Components

### 6.1 `DockerSandboxProvider` hardening (EXISTING file, modified)

- **File:** [lib/sandbox/providers/docker.ts](lib/sandbox/providers/docker.ts) — already implements `SandboxProvider` and speaks SSH to a remote Docker host.
- **Current state (already works):** nanoid-based container naming, labeled with `cowork-claw=true`, configurable port mapping, `--memory=4g --cpus=<vcpus>`, git install, repo clone, background cleanup timer, `stop()`, `get()`.
- **Changes for launch:**
  1. Replace the default base image from `node:<runtime>` to `cowork-claw/runner:latest` when `config.source` indicates a task (not a classic dev-sandbox). Keep the node-image path for backward compatibility with the task-form flow.
  2. Lower default resource caps from `--memory=4g --cpus=4` to `--memory=2g --cpus=2` and add `--pids-limit=512`. Tier-specific caps come from the Next task route and are passed into `config.resources`.
  3. Mount a host artifact volume: `-v /var/lib/cowork-artifacts/<sandbox_id>:/out`. The host directory is created by the Next task route before calling `create()`.
  4. Pass the user's Anthropic key as `-e ANTHROPIC_API_KEY=<key>` via `config.env` (add `env` to `SandboxCreateConfig` in `provider.ts`).
  5. Add a pre-spawn global concurrency check: `docker ps --filter label=cowork-claw=true -q | wc -l` over SSH; if ≥ `MAX_CONCURRENT_SANDBOXES` (env, default `8`), throw a sentinel error `SandboxCapError` that the Next route converts into a `429 CW-SBX01`.
  6. Add static-only logging per `AGENTS.md` — no container names, no paths, no keys in any log line.
- **No HTTP service, no separate container, no Docker socket mount in the web-facing process.** The SSH connection is the remote-control channel.

### 6.2 `task-runner` image (NEW — built once)

- **Base:** `debian:stable-slim`
- **Installed:** git, curl, node LTS, pnpm, python 3.12, Claude Code CLI, Codex CLI, Copilot CLI, Cursor CLI, Gemini CLI, opencode, a minimal `entrypoint.sh`
- **Entrypoint contract:**
  - Reads `TASK_ID`, `TEMPLATE_SLUG`, `PARAMS_JSON`, `ANTHROPIC_API_KEY` from env
  - Loads template definition from `/templates/<slug>.json` (baked into image)
  - Invokes Claude Code CLI in headless mode with the template's agent-team spec and tool allowlist
  - Writes all deliverables to `/out` (mounted from host: `/var/lib/cowork-artifacts/<task_id>/`)
  - POSTs progress events to `http://sandbox-manager:7000/events/<task_id>` with the shared secret header
  - Exits `0` on success, non-zero on failure
- **Versioning:** `cowork-claw/runner:<semver>` tags; `:latest` is set during deploy. Do **not** auto-update CLIs on launch day.
- **Image size budget:** < 2GB. If it grows past that, the pre-launch pull on the VPS becomes a risk; revisit slimness.

### 6.3 `lib/sandbox/factory.ts` simplification (EXISTING file, modified)

- **Purpose:** the factory currently picks between `DockerSandboxProvider` and `VercelSandboxProvider` based on env. After launch, docker is the only provider.
- **Change:** delete the vercel branch entirely and always return `DockerSandboxProvider`. Delete `providers/vercel.ts`. Remove `@vercel/sandbox` from `package.json`. Remove `SANDBOX_VERCEL_*` env references from runtime code (keep them in `.env.example` for one release as a deprecation note, then drop).
- **Test obligation:** Smoke Test 2 (§10.2) verifies the provider interface still works end-to-end after the delete.

### 6.4 Workflow Templates — seed data + UI strip (NEW — minimal)

- **New DB table:** `workflow_templates(id, slug, name, description, category, icon, agent_team_json, default_prompt, params_schema, created_at)`.
- **Seed script:** `pnpm db:seed:templates` runs on deploy and is idempotent (upsert by slug).
- **UI surfacing:** a horizontal template strip above the existing chat/task-form landing state. Each tile opens a modal with fields generated from `params_schema`, then dispatches a task.
- **Day-one template set (all 10 ship tomorrow):**
  1. **Pitch deck builder** — company + audience + offer → 10–12 slide deck (.pptx + .md + preview.png)
  2. **Cold-outbound prospecting pipeline** — ICP → enriched prospect list (.csv)
  3. **Proposal / SOW generator** — client + scope → proposal (.md + .pdf)
  4. **Market & competitor research brief** — company/topic → structured research doc (.md)
  5. **Content repurposing pipeline** — long-form input → thread + LI post + newsletter + shortform script
  6. **Inbox triage & reply drafter** — pasted/uploaded emails → categorized list + draft replies
  7. **Meeting prep pack** — meeting + attendees + context → briefing doc (.md)
  8. **Weekly investor/stakeholder update** — metrics/wins/blockers → formatted update (.md)
  9. **Landing page copy from a brief** — one-liner → hero/features/FAQ/CTA copy (.md)
  10. **Hiring pipeline kickoff** — role description → JD + rubric + scorecard + sourcing strings

### 6.5 BYO-key onboarding (NEW — small flow)

- `/onboarding/key` page with a single input, one validate button, one "Try a sample task" CTA.
- Validation: `POST https://api.anthropic.com/v1/messages` with `max_tokens: 1` and a trivial prompt; if `200`, encrypt with `ENCRYPTION_KEY` and store in existing `keys` table.
- Middleware gate: any authenticated, paid user without a valid key is redirected here before any task creation.
- Re-validation: if a task fails with `CW-KEY02` (upstream 401/403), flip the key's `valid` flag and re-route the next load through this page.

### 6.6 Artifact storage (NEW — local volume + signed URL)

- Host path: `/var/lib/cowork-artifacts/<task_id>/`, mounted into the runner at `/out`.
- New table: `task_artifacts(id, task_id, user_id, filename, mime, size, path, created_at)`.
- Signed URLs: `/api/artifacts/:id?sig=...&exp=...`, HMAC-SHA256 of `id|exp` with `ENCRYPTION_KEY`, 1-hour expiry, user-ownership check.
- Cleanup job: nightly `tsx scripts/cleanup-artifacts.ts` deletes artifacts older than 7 days and their DB rows.
- Per-task artifact cap: 500MB, enforced by sandbox-manager pre-spawn `du` check on the volume and by a `--storage-opt size=500m` where the storage driver supports it.

### 6.7 Stripe pricing wiring

- Create 4 live-mode prices (Hobby/Pro/Studio/White-label) in Stripe.
- Map them in `lib/stripe/products.ts` (exists).
- Webhook already handled; verify the paid-flag flip in preflight (§10.3).

### 6.8 Cloudflare + domain

- A record → VPS IP, proxied.
- TLS via Cloudflare (Full or Full-strict).
- Optional: a rate-limit rule on `/api/tasks` (e.g., 10/min per IP) to blunt launch-day abuse without blocking normal use.

### 6.9 Landing page rewrite (Astro `site/`)

- **Headline:** *"Stop doing office work. Your AI team does it together."*
- **Tagline (sub):** *"Cowork meets OpenClaw — for founders."*
- **Hero CTA:** "Start with your own Anthropic key — $19/mo"
- **Section 1:** 3–5 screenshots/GIFs of template runs producing real deliverables.
- **Section 2:** pricing (the table in §5).
- **Section 3:** "How it works" — a simplified OpenClaw explanation, *no* "multi-agent orchestration" jargon, workflow builder screenshot *only here*.
- **Section 4:** FAQ (BYO-key explained, what happens to my data, refund policy).
- **No lifetime pricing row anywhere.**

### 6.10 Docker Compose reconfig

`docker-compose.prod.yml` gains:

- `postgres` service (local persistence under `/var/lib/cowork-pg/`)
- `db-migrate` one-shot service that runs Drizzle migrations + `db:seed:templates` on boot
- `next-app` service updated to depend on `postgres` and to receive SSH credentials (`SANDBOX_SSH_HOST`, `SANDBOX_SSH_KEY`, `SANDBOX_SSH_USER`, `SANDBOX_SSH_PORT`) as env vars
- **No `sandbox-manager` service.** The runner containers are launched via SSH directly from `next-app` through `DockerSandboxProvider`.
- **Docker host for runners:** two options, pick one during P1 — (a) SSH to `localhost`/`host.docker.internal` so `next-app` launches sibling containers on the same VPS, or (b) a dedicated docker host VM reached over the private network. For tomorrow, (a) is simplest; (b) is a v2 split when you want to isolate runners from the web tier.

### 6.11 Components explicitly not touched

Supabase auth, Stripe backend code, middleware paid-gate, OpenClaw chat logic, workflow builder rendering, Monaco editor, git diff viewer, multi-agent support, MCP connectors UI. These all already work; touching them on launch day is a risk with no matching reward.

---

## 7. Data flow

### 7.1 Happy-path lifecycle ("Pitch deck builder")

1. **Browser**: user (signed-in, paid, key set) clicks the "Pitch deck builder" tile; a modal opens with fields from `params_schema`.
2. **Next.js `POST /api/tasks`**: auth check, paid-gate check, daily-limit check, per-tier concurrency-cap check, fetches and decrypts the user's Anthropic key, renders `default_prompt` with user params, inserts a `tasks` row with `status='queued'`, calls `getSandboxProvider().create({ image: 'cowork-claw/runner:latest', env: { ANTHROPIC_API_KEY, TASK_ID, TEMPLATE_SLUG, PARAMS_JSON }, resources: { vcpus: 2, memMb: 2048 }, artifactVolume: '/var/lib/cowork-artifacts/<sandbox_id>', timeout: tierMaxTaskMs })`.
3. **`DockerSandboxProvider.create()`** (running inside `next-app`): over SSH runs the global concurrency check, then `docker run -d --name sandbox-<id> --label cowork-claw=true --memory=2g --cpus=2 --pids-limit=512 -e ANTHROPIC_API_KEY -e TASK_ID -e TEMPLATE_SLUG -e PARAMS_JSON -v /var/lib/cowork-artifacts/<id>:/out cowork-claw/runner:latest`, schedules the cleanup timer, returns a `DockerSandboxInstance`. The Next route updates the task row with `sandbox_id=<id>` and `status='running'`.
4. **task-runner**: entrypoint reads env, invokes Claude Code CLI in headless mode with the template's agent-team spec, writes deliverables to `/out`, appends progress lines to `/out/progress.log`, exits 0.
5. **Next.js progress streaming**: the task's SSE endpoint (`/api/tasks/:id/stream`) tails `/out/progress.log` over SSH (`docker exec sandbox-<id> tail -f /out/progress.log`) and forwards lines to the browser. On container exit, the endpoint scans `/var/lib/cowork-artifacts/<id>/`, inserts `task_artifacts` rows, updates the task to `completed`, emits a final SSE `done` event.
6. **Browser**: swaps the progress view for "Deliverable ready", shows signed-URL download buttons, shows inline preview, offers "Refine" (new task) and "Start new" actions.

### 7.2 Where the user's Anthropic key lives

| Step | Location |
|---|---|
| At rest | `keys` table, AES-256-GCM with `ENCRYPTION_KEY` |
| In Next handler | Local variable for the duration of `getSandboxProvider().create()` only |
| In transit Next → dockerd | Over the SSH session to the docker host, inside a `docker run -e ANTHROPIC_API_KEY=<key>` shell command. SSH provides the encryption; the key never leaves the VPS (or the private network, if the docker host is on a separate box). |
| In dockerd | Passed through to the container as an env var. Never written to disk by docker itself. |
| In task-runner | Process env var on the Claude Code CLI process. Dies with the container. |
| In any log | **Never.** Static log messages only, per `AGENTS.md`. The SSH command string that contains the env var must be built in-memory and never logged or echoed. |

### 7.3 Variations by template

- **File uploads** (inbox triage, meeting prep, content repurposing): `POST /api/tasks` accepts `multipart/form-data`; Next writes uploads to `/var/lib/cowork-artifacts/<task_id>/inputs/` before `create()`. Runner reads from `/out/inputs/`.
- **Web access**: runner containers have outbound internet by default. Egress allowlists are a v2 hardening item.
- **Multiple deliverables**: each file in `/out/` becomes its own `task_artifacts` row.
- **"Refine"**: a *new* task with the prior task's artifacts as inputs plus the user's feedback text appended to the prompt. Not a conversational loop.

### 7.4 Concurrency and resource budget

- Per-task container resources: 2 CPU, 2GB RAM, 512 PIDs.
- Per-tier concurrency caps: 1 / 2 / 3 / 5.
- Global: `MAX_CONCURRENT_SANDBOXES=8`, enforced in sandbox-manager regardless of tier.
- Over-cap: HTTP 429 with `CW-TASK03` (tier) or `CW-SBX01` (global).

### 7.5 Next.js restart mid-task

- Runner container keeps running (owned by dockerd, not by `next-app`). The SSH session for progress streaming dies with the Next process, but the container does not.
- Browser's SSE drops; on reconnect, `GET /api/tasks/<id>/stream` opens a fresh SSH `docker exec ... tail -f /out/progress.log` on the docker host, which picks up from the current file position (file survives the outage).
- On Next boot, a reconciliation pass queries Postgres for tasks in `status='running'` and for each one runs `docker inspect sandbox-<id>` over SSH:
  - Container still running → do nothing; SSE will reattach on next browser request.
  - Container exited while down → scan `/out/`, register artifacts, mark `completed` or `failed` based on exit code.
  - Container missing (killed by cleanup timer past its TTL) → scan `/out/`, register any artifacts, mark `completed` if `/out/progress.log` shows a clean finish line, else `failed`.
- Net effect: short reconnect, no task loss in the common case.

### 7.6 dockerd / docker host restart mid-task

- All running containers die. Any task that was mid-run is unrecoverable.
- On next Next boot, the reconciliation pass from §7.5 marks any `status='running'` task with a missing container as `failed`.
- **Accepted edge case:** docker host reboot during a task = that task is `failed`, user retries. Durable queue and crash-safe recovery are v2.

---

## 8. Error handling

### 8.1 Error taxonomy

| # | Class | Where | User message (static) | System action |
|---|---|---|---|---|
| E1 | Auth / payment | Supabase middleware | "Sign in" / "Subscribe to continue" | Redirect |
| E2 | BYO-key missing/invalid | Onboarding + pre-task | "Add your Anthropic key to start" | Redirect to `/onboarding/key` |
| E3 | Daily / concurrency cap | Task route | "You've hit your plan limit. Upgrade or wait." | 429 `CW-TASK03` |
| E4 | Global sandbox cap | `DockerSandboxProvider.create()` (pre-spawn check) | "We're at capacity — please retry in a minute." | 429 `CW-SBX01` |
| E5 | Container failed to start | `DockerSandboxProvider.create()` | "We couldn't start your task. Try again." | Task `failed`, auto-retry once |
| E6a | Anthropic 429/5xx | runner via Claude CLI | "Upstream was flaky. Retrying…" | CLI auto-retries up to 3× |
| E6b | Anthropic 401/403 | runner via Claude CLI | "Your Anthropic key was rejected. Check your key and try again." | Flip key `valid=false`, route to onboarding |
| E7 | Task timeout | sandbox-manager watcher | "This task ran longer than your plan allows. Upgrade for longer runs." | `docker stop`, task `timeout` |
| E8 | No artifact produced | sandbox-manager on exit | "Your task finished but produced nothing. Try rephrasing or pick a template." | Task `empty` |
| E9 | Artifact URL expired | Next | "This download link has expired. Open the task to get a fresh link." | 410 |
| E10 | DB unavailable | any | "Something went wrong. Please retry." | 503, server-side stack log |
| E11 | Next.js crash mid-task | process | (see §7.5) | Runner continues |
| E12 | docker host crash | process | (see §7.6) | Reconcile on Next boot, affected tasks marked `failed` |
| E13 | Artifact volume full | `DockerSandboxProvider.create()` pre-spawn disk check | Same as E4 | Cleanup job + 80% disk block |
| E14 | Egress failure | runner | Template-specific: "Couldn't reach the web. Retry." | Task `failed` |
| E15 | User cancel | browser → sandbox-manager | "Task cancelled." | `docker stop`, task `cancelled`, slot not refunded |
| E16 | Stripe webhook race | middleware | "Finalizing your subscription…" | Auto-retry 2–3s |

### 8.2 Error code convention

`CW-<LAYER><NN>` where LAYER ∈ {AUTH, TASK, SBX, KEY, NET, SYS}. Static string prefixes only, ever; dynamic context goes to server-side logs, never into user-visible messages. This is the `AGENTS.md` rule restated.

### 8.3 Auto-retry budget

| Class | Retry? | How |
|---|---|---|
| E5 | Yes, once, 2s backoff, in `DockerSandboxProvider.create()` | Transient Docker issues |
| E6a | Yes, up to 3× expo backoff, in the Claude CLI | Upstream flakiness |
| E6b | No | User must fix key |
| E10 (reads) | Yes, once | Transient DB hiccup |
| E14 | No | Avoid compounding timeouts |
| E7 | No | Retrying doubles billing |
| Everything else | No | Surface |

### 8.4 Observability (minimum viable)

- `docker logs -f next-app` and `docker logs -f postgres` tailed manually during launch
- `task_logs` table, visible in the progress UI and in Drizzle Studio
- `GET /api/health` returning `{ db, sshToDocker, diskFree }` for an external uptime pinger (UptimeRobot or equivalent) — the `sshToDocker` probe opens a cached SSH connection and runs `docker info` with a 2s timeout
- Error codes grep-able across all containers
- Metrics stack deferred to v2

### 8.5 Launch-night disasters, pre-mitigated

1. **VPS CPU saturation** → tier caps + global cap + 429s + verified in load test (§10.4).
2. **Artifact volume fills** → 7-day cleanup + per-task 500MB cap + 80% disk block on spawn.
3. **One user burns their Anthropic quota** → E6 routes them back to onboarding; not our billing.
4. **CLI prompts interactively** → runner forces headless flags; any template repeatedly hitting E7 is escalated.
5. **BYO-key leaks in logs** → `AGENTS.md` static-log rule + `redactSensitiveInfo()` backup + error-code convention.
6. **Launch thread drives 10× traffic and onboarding breaks** → Smoke Test 4 (§10.2) covers it; preflight checklist re-verifies.

### 8.6 Not errors (treat as success)

- Partial deliverable (e.g., 8 slides instead of 10) → `completed`.
- Agent team produces a conservative output after internal disagreement → `completed`.
- User cancels and immediately retries → two separate tasks, both billed against the daily limit. Correct; compute was spent.

---

## 9. Data model changes

New tables (Drizzle):

- `workflow_templates(id, slug UNIQUE, name, description, category, icon, agent_team_json, default_prompt, params_schema, created_at, updated_at)`
- `task_artifacts(id, task_id FK, user_id FK, filename, mime, size BIGINT, path, created_at)`

Existing tables touched:

- `tasks`: add `template_slug` nullable (for template-originated tasks), add `status` enum expansion (`queued`, `running`, `completed`, `failed`, `timeout`, `cancelled`, `empty`), add `sandbox_id` nullable, add `concurrency_slot` nullable.
- `keys`: add `valid BOOLEAN DEFAULT true`, `last_validated_at TIMESTAMPTZ NULL`.

Migrations are run by the `db-migrate` one-shot service on every deploy, followed by `db:seed:templates` for the template rows.

---

## 10. Testing & launch verification

### 10.1 Test pyramid

| Tier | Scope | Tool | When |
|---|---|---|---|
| T1 | Type/lint gates | `pnpm type-check`, `pnpm lint`, `pnpm format:check`, `pnpm build` | Pre-commit and pre-deploy |
| T2 | 5 smoke tests | `tsx scripts/smoke/*.ts` against local compose | Pre-deploy and again post-deploy on VPS |
| T3 | Launch-eve load test | `oha` against the live VPS | Once, the hour before launch post |

**Zero new dev dependencies.** No Vitest, no Playwright. Smoke scripts use plain TS with the existing `tsx`.

### 10.2 Smoke tests (the full list)

1. **`DockerSandboxProvider` contract** — import the provider directly, call `create({ image: 'cowork-claw/runner:latest', env: { ... }, resources, artifactVolume })`, assert an instance is returned, the container runs over SSH, writes a known file to `/out`, `stop()` succeeds, no orphaned containers remain.
2. **Factory + interface parity** — call `getSandboxProvider()` from the same entry point the app uses; run `create → runCommand → stop`; assert each method returns the shape existing call sites expect (no regressions after removing the vercel branch). *Most important test — protects every existing call site.*
3. **End-to-end template: "Landing page copy from a brief"** — cheapest Anthropic cost; seed a test user with a real key, POST `/api/tasks`, poll until `completed`, assert the artifact is non-empty and >200 chars. ~$0.05 per run.
4. **Onboarding gate** — no-key user hits `/app` → redirected; invalid key rejected; valid key accepted; `/app` no longer redirects.
5. **Tier limits & concurrency caps** — Hobby user submits 6 tasks rapidly; first runs, rest 429; with `MAX_CONCURRENT_SANDBOXES=2` set for the test, the 3rd concurrent task is rejected across all users.

### 10.3 Manual preflight checklist (15 minutes before launch post)

- [ ] Cloudflare DNS resolves to VPS; HTTPS cert valid; `curl -I` returns `200`
- [ ] `/` loads with the correct headline and tagline
- [ ] Stripe checkout with `4242...` → webhook fires → paid flag flips → redirect to `/onboarding/key`
- [ ] Paste real Anthropic key → validation passes → redirect to `/app`
- [ ] Click "Pitch deck builder" → fill params → Start → progress visible → real `.pptx` downloads
- [ ] Cancel a running task → goes to `cancelled`, container gone
- [ ] `GET /api/health` returns all `ok`
- [ ] `docker stats` shows `next-app` < 800MB idle and no runaway runner containers
- [ ] `df -h /var/lib/cowork-artifacts` > 20GB free
- [ ] UptimeRobot (or equivalent) polling `/api/health` every minute
- [ ] Anthropic usage dashboard open in a tab
- [ ] A second fresh-user browser session logged in and idle, ready for live retry

### 10.4 Launch-eve load test (mandatory, ~10 min)

```
oha -z 120s -c 200 -q 50 https://yourdomain.tld/
oha -z 60s  -c 50  -q 20 https://yourdomain.tld/api/templates
```

Success criteria:

- `/` p95 < 500ms under 200 concurrent for 2 minutes
- `/api/templates` p95 < 200ms
- Zero 5xx
- VPS CPU < 70% sustained

Failure response: vertically upgrade the Hetzner box (~5 minutes), re-run, proceed. **Do not load-test `/api/tasks` with real sandboxes** — that's what tier caps are for.

### 10.5 Post-launch monitoring (first 4 hours)

- Terminal 1: `docker logs -f next-app` filtered for `CW-`
- Terminal 2: `ssh <docker-host> 'docker ps --filter label=cowork-claw=true'` on a 5s watch
- Terminal 3: `watch -n 5 'docker ps && df -h /var/lib/cowork-artifacts && free -h'`
- Browser 1: Stripe dashboard (live payments)
- Browser 2: `/api/health` on auto-refresh
- Browser 3: Drizzle Studio on the `tasks` table

### 10.6 Explicitly not tested tomorrow

No unit tests, no Playwright / browser e2e automation, no chaos / fault injection, no security / pen tests, no performance profiling beyond T3, no multi-region tests (there is no multi-region), no template output-quality scoring (human eyeball only). All of the above land on the v2 roadmap.

### 10.7 Time budget for testing within the ~14–18h launch window

- Writing 5 smoke scripts: ~90 min
- T1 gates: trivial, automatic
- Running T2 locally once: ~15 min
- T3 load test on VPS: ~10 min + 5 min re-run
- Manual preflight: ~15 min

**Total: ~2h 15m.** If testing exceeds this, scope has drifted; stop and reassess.

---

## 11. Security notes

- **Static logs only**, per `AGENTS.md`. Enforced by code review and by `redactSensitiveInfo()` as a backup.
- **Key encryption at rest** via existing `ENCRYPTION_KEY` util. No plaintext keys anywhere on disk.
- **Signed URLs** for artifacts (1-hour expiry, HMAC over id + exp).
- **SSH-only access** from `next-app` to the docker host; keys live in env (`SANDBOX_SSH_KEY`, base64-encoded), never exposed through Cloudflare. Consider binding dockerd to localhost and SSH-tunneling via the VPS's private network only.
- **Cloudflare rate-limit** on `/api/tasks` as a coarse DoS cushion.
- **Soft isolation** for day one (per-container cpu/mem/pids limits, no nested virt). Hardened isolation is v2.
- **Runner containers have outbound internet** by default; egress allowlists are v2.
- **Docker socket** is not mounted into any container. All Docker operations go through SSH to the docker host.

---

## 12. Roadmap after launch (v2 and later)

- Hardened sandbox isolation (gVisor / Firecracker)
- Multi-VPS segmentation per client (enterprise / white-label)
- Durable task queue + crash-safe recovery
- Managed-API tier with per-user metering and markup
- S3/R2 artifact storage
- Conversational refine loops
- Metrics stack (Prometheus / OTel / Grafana)
- MCP bundle catalog, "proven tools" library
- Integrations (Linear, Sentry, PostHog, Slack, Discord)
- Lifetime pricing tier via partner deal (separate launch event)

---

## 13. Open questions / assumptions

- **Assumption:** white-label tier is $399/**month recurring**, not one-time. User did not explicitly confirm either way; monthly is the only shape that doesn't cannibalize future lifetime partner economics.
- **Assumption:** the existing `docker-compose.prod.yml` is a reasonable starting point; this will be verified when the plan begins.
- **Assumption:** the existing Stripe webhook handler already flips a `paid` flag the middleware reads; verified in preflight (§10.3).
- **Assumption:** Cloudflare account and domain are ready for wiring, not needing to be created.
- **Assumption:** the 10 day-one templates can all be implemented as "preset prompt + agent-team spec" inside Claude Code CLI, without bespoke tool development. If any template proves to need custom tools (e.g., a real pptx renderer), that specific template is dropped from day-one and replaced with a simpler one on the plan phase.
