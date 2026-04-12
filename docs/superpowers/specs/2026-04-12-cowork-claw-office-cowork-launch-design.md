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
- A `sandbox-manager` service exposing the same interface the existing code uses for `@vercel/sandbox`, so the rest of the app is oblivious to the swap
- A pre-built `cowork-claw/runner:latest` Docker image with Claude Code CLI and the other agent CLIs baked in
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
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐ ┌─────────▼────────┐ ┌─────────▼────────┐
     │  next-app       │ │ sandbox-manager  │ │   postgres       │
     │  (Next.js 16)   │ │  (Docker-outside-│ │  (local, on VPS) │
     │  Supabase auth  │ │   Docker host)   │ │                  │
     │  Stripe         │ │                  │ │                  │
     │  OpenClaw chat  │ │ spawns per-task  │ │                  │
     │                 │ │ ephemeral        │ │                  │
     │                 │ │ containers       │ │                  │
     └────────┬────────┘ └─────────┬────────┘ └──────────────────┘
              │                    │
              │                    ▼
              │         ┌──────────────────┐
              │         │ task-runner-N    │  ← ephemeral, one per task
              │         │ (user's prompt + │    - resource-limited
              │         │  Claude Code CLI │    - auto-destroyed
              │         │  runs with       │    - outputs to /out volume
              │         │  user's key)     │
              │         └──────────────────┘
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
2. **`sandbox-manager` is a separate container**, not inlined into the Next.js process. Reasons: a Next.js restart must not kill running tasks; the Docker socket should not be mounted into the web-facing process; restart semantics (§7.5–7.6) depend on the two processes being independent.
3. **Pre-built `task-runner` image**, not per-task image builds. One image ships with all agent CLIs at pinned versions. No auto-updates on launch day.
4. **BYO-key flow** is DB → Next handler → sandbox-manager → container env. Key never touches disk in the container, never appears in any log.
5. **Local Postgres on the VPS** (not Neon). Removes an external dependency and latency hop. Neon can be re-adopted later if multi-VPS demands it.
6. **Workflow templates are DB seed data** in a new `workflow_templates` table, not hardcoded in TypeScript. Adding templates post-launch is a seed-script run, not a redeploy.
7. **No job queue.** Tasks run via direct HTTP from Next handler → sandbox-manager. Crashes mid-task = failed task, user retries.
8. **Explicit v2 deferrals:** hardened isolation, autoscale, durable queue, multi-VPS.

---

## 4. Inventory: keep / hide / scrap / build

| # | Thing in repo | Action |
|---|---|---|
| 1 | Next.js 16 app (app router) | Keep |
| 2 | Supabase auth + paid-gate middleware | Keep |
| 3 | Stripe checkout + pricing | Keep; add 4 price IDs |
| 4 | Drizzle schema + migrations | Keep; add `workflow_templates`, `task_artifacts` tables |
| 5 | `@vercel/sandbox` | **Scrap** |
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

### 6.1 `sandbox-manager` (NEW — critical path)

- **Purpose:** HTTP service that creates, inspects, streams from, sends input to, and destroys task-runner containers via the host Docker socket.
- **Interface** (must match the surface `@vercel/sandbox` currently exposes to the existing code):
  - `POST /sandboxes` → `create({ image, envs, timeoutMs, resources }) → { id }`
  - `POST /sandboxes/:id/exec` → streams `{ stdout, stderr, exit }`
  - `POST /sandboxes/:id/files` → `writeFile(path, contents)`
  - `GET /sandboxes/:id/files?path=...` → `readFile(path)`
  - `DELETE /sandboxes/:id` → `destroy()`
  - `GET /sandboxes` → `list()`
  - `POST /events/:taskId` → progress events from inside the runner
  - `GET /sandboxes/:id/stream` → SSE of progress events for the client
- **Dependencies:** Docker socket (`-v /var/run/docker.sock:/var/run/docker.sock`), Postgres (for `container_id ↔ task_id` mapping), `cowork-claw/runner:latest` image locally available.
- **Authentication:** shared-secret header (`X-SBX-SECRET`) on every call; secret lives in the same env file as the rest of the app. Not TLS internally because both services are on the same host behind Cloudflare.
- **Concurrency:** tracks a global `MAX_CONCURRENT_SANDBOXES` (default `8`), rejects with `429 CW-SBX01` above cap.

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

### 6.3 `lib/sandbox/client.ts` (NEW — the swap-in)

- **Purpose:** thin HTTP client that exposes the exact same surface as `@vercel/sandbox`, so every current call site changes by one import line only.
- **Implementation:** `fetch` wrapper with the shared-secret header, returning objects shaped identically to `@vercel/sandbox`'s returns.
- **Test obligation:** Smoke Test 2 (§10.2) verifies parity. This is the single most important test.

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
- `sandbox-manager` service with Docker socket mount and `cowork-net` network
- `db-migrate` one-shot service that runs Drizzle migrations + `db:seed:templates` on boot
- `next-app` service updated to depend on `postgres` and `sandbox-manager`

### 6.11 Components explicitly not touched

Supabase auth, Stripe backend code, middleware paid-gate, OpenClaw chat logic, workflow builder rendering, Monaco editor, git diff viewer, multi-agent support, MCP connectors UI. These all already work; touching them on launch day is a risk with no matching reward.

---

## 7. Data flow

### 7.1 Happy-path lifecycle ("Pitch deck builder")

1. **Browser**: user (signed-in, paid, key set) clicks the "Pitch deck builder" tile; a modal opens with fields from `params_schema`.
2. **Next.js `POST /api/tasks`**: auth check, paid-gate check, daily-limit check, concurrency-cap check, fetches and decrypts the user's Anthropic key, renders `default_prompt` with user params, inserts a `tasks` row with `status='queued'`, calls `sandboxClient.create()`.
3. **sandbox-manager**: pulls `cowork-claw/runner:latest` if missing, `docker run -d --rm --name task-<id> --memory=2g --cpus=2 --pids-limit=512 --network=cowork-net -e ANTHROPIC_API_KEY -e TASK_ID -e TEMPLATE_SLUG -e PARAMS_JSON -v /var/lib/cowork-artifacts/<task_id>:/out cowork-claw/runner:latest`, stores `container_id ↔ task_id` in Postgres, returns `{ id }`.
4. **task-runner**: entrypoint reads env, invokes Claude Code CLI in headless mode with the template's agent-team spec, writes deliverables to `/out`, streams progress events back to sandbox-manager, exits 0.
5. **sandbox-manager**: writes progress events to `task_logs`, streams to any connected SSE client, on container exit scans `/var/lib/cowork-artifacts/<task_id>/`, inserts `task_artifacts` rows, updates the task to `completed`, emits a final SSE `done` event.
6. **Browser**: swaps the progress view for "Deliverable ready", shows signed-URL download buttons, shows inline preview, offers "Refine" (new task) and "Start new" actions.

### 7.2 Where the user's Anthropic key lives

| Step | Location |
|---|---|
| At rest | `keys` table, AES-256-GCM with `ENCRYPTION_KEY` |
| In Next handler | Local variable for the duration of `sandboxClient.create()` only |
| In transit Next → sandbox-manager | Over `cowork-net` Docker network, shared-secret header. Not TLS internally; key never leaves the VPS. |
| In sandbox-manager | Held only long enough to pass as `-e ANTHROPIC_API_KEY` to `docker run`. Never written to disk. |
| In task-runner | Process env var on the Claude Code CLI process. Dies with the container. |
| In any log | **Never.** Static log messages only, per `AGENTS.md`. |

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

- Runner keeps running (owned by sandbox-manager).
- Browser's SSE drops; on reconnect, `GET /api/tasks/<id>` → re-opens SSE via sandbox-manager, which has been buffering.
- Net effect: short reconnect, no task loss.

### 7.6 sandbox-manager restart mid-task

- Running containers are orphaned but still executing.
- On boot, sandbox-manager queries Postgres for `status='running'` tasks and reconciles against `docker ps`:
  - Container still running → re-attach event streams.
  - Container exited cleanly while down → scan `/out/`, register artifacts, mark `completed`.
  - Container missing → mark `failed`.
- **Accepted edge case:** sandbox-manager AND the container dying inside the same outage window = task marked `failed`, user retries.

---

## 8. Error handling

### 8.1 Error taxonomy

| # | Class | Where | User message (static) | System action |
|---|---|---|---|---|
| E1 | Auth / payment | Supabase middleware | "Sign in" / "Subscribe to continue" | Redirect |
| E2 | BYO-key missing/invalid | Onboarding + pre-task | "Add your Anthropic key to start" | Redirect to `/onboarding/key` |
| E3 | Daily / concurrency cap | Task route | "You've hit your plan limit. Upgrade or wait." | 429 `CW-TASK03` |
| E4 | Global sandbox cap | sandbox-manager | "We're at capacity — please retry in a minute." | 429 `CW-SBX01` |
| E5 | Container failed to start | sandbox-manager | "We couldn't start your task. Try again." | Task `failed`, auto-retry once |
| E6a | Anthropic 429/5xx | runner via Claude CLI | "Upstream was flaky. Retrying…" | CLI auto-retries up to 3× |
| E6b | Anthropic 401/403 | runner via Claude CLI | "Your Anthropic key was rejected. Check your key and try again." | Flip key `valid=false`, route to onboarding |
| E7 | Task timeout | sandbox-manager watcher | "This task ran longer than your plan allows. Upgrade for longer runs." | `docker stop`, task `timeout` |
| E8 | No artifact produced | sandbox-manager on exit | "Your task finished but produced nothing. Try rephrasing or pick a template." | Task `empty` |
| E9 | Artifact URL expired | Next | "This download link has expired. Open the task to get a fresh link." | 410 |
| E10 | DB unavailable | any | "Something went wrong. Please retry." | 503, server-side stack log |
| E11 | Next.js crash mid-task | process | (see §7.5) | Runner continues |
| E12 | sandbox-manager crash | process | (see §7.6) | Reconcile on boot |
| E13 | Artifact volume full | sandbox-manager spawn | Same as E4 | Cleanup job + 80% disk block |
| E14 | Egress failure | runner | Template-specific: "Couldn't reach the web. Retry." | Task `failed` |
| E15 | User cancel | browser → sandbox-manager | "Task cancelled." | `docker stop`, task `cancelled`, slot not refunded |
| E16 | Stripe webhook race | middleware | "Finalizing your subscription…" | Auto-retry 2–3s |

### 8.2 Error code convention

`CW-<LAYER><NN>` where LAYER ∈ {AUTH, TASK, SBX, KEY, NET, SYS}. Static string prefixes only, ever; dynamic context goes to server-side logs, never into user-visible messages. This is the `AGENTS.md` rule restated.

### 8.3 Auto-retry budget

| Class | Retry? | How |
|---|---|---|
| E5 | Yes, once, 2s backoff, in sandbox-manager | Transient Docker issues |
| E6a | Yes, up to 3× expo backoff, in the Claude CLI | Upstream flakiness |
| E6b | No | User must fix key |
| E10 (reads) | Yes, once | Transient DB hiccup |
| E14 | No | Avoid compounding timeouts |
| E7 | No | Retrying doubles billing |
| Everything else | No | Surface |

### 8.4 Observability (minimum viable)

- `docker logs -f` on each container, tailed manually during launch
- `task_logs` table, visible in the progress UI and in Drizzle Studio
- `GET /api/health` returning `{ db, sandboxManager, diskFree }` for an external uptime pinger (UptimeRobot or equivalent)
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

1. **sandbox-manager contract** — `POST /sandboxes` with a trivial runner job that writes `hi.txt`; assert container runs, exits, file exists, task row is `completed`, container gone.
2. **`lib/sandbox/client.ts` parity** — call `create → exec → readFile → destroy`; assert each method returns the shape the existing task-runner code expects. *Most important test.*
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
- [ ] `docker stats` shows sandbox-manager < 500MB idle
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
- Terminal 2: `docker logs -f sandbox-manager` filtered for `CW-`
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
- **Shared-secret header** between Next and sandbox-manager; same-host only, never exposed through Cloudflare.
- **Cloudflare rate-limit** on `/api/tasks` as a coarse DoS cushion.
- **Soft isolation** for day one (per-container cpu/mem/pids limits, no nested virt). Hardened isolation is v2.
- **Runner containers have outbound internet** by default; egress allowlists are v2.
- **Docker socket** is mounted only into sandbox-manager, never into the web-facing Next container.

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
