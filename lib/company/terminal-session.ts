import 'server-only'

import { randomBytes } from 'crypto'
import { db } from '@/lib/db/client'
import { terminalSessions, userEnvironments } from '@/lib/db/schema'
import type { TerminalSession } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { execAsRoot, execAsUser, shellEscapeSingleQuoted } from './vps-client'

export type TerminalCli = 'claude' | 'codex' | 'cursor' | 'gemini' | 'copilot' | 'opencode' | 'bash'

const SESSION_TTL_MS = 10 * 60 * 1000
const PORT_MIN = 40000
const PORT_MAX = 40999

/**
 * Command each CLI runs to begin an interactive login flow. ttyd exits when
 * the command exits, so these are intentionally single-shot.
 */
const CLI_LOGIN_COMMANDS: Record<TerminalCli, string> = {
  claude: 'claude login',
  codex: 'codex auth login || codex login',
  cursor: 'cursor-agent login',
  gemini: 'gemini auth login',
  copilot: 'gh auth login --hostname github.com --web',
  opencode: 'opencode auth login',
  bash: 'bash -i',
}

function pickRandomPort(): number {
  return Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1)) + PORT_MIN
}

async function portIsFree(port: number): Promise<boolean> {
  const result = await execAsRoot(`ss -ltn '( sport = :${port} )' | tail -n +2 | wc -l`, {
    timeoutMs: 10000,
    maxRetries: 1,
  })
  return result.exitCode === 0 && result.stdout.trim() === '0'
}

async function findAvailablePort(): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const port = pickRandomPort()
    const [existing] = await db
      .select()
      .from(terminalSessions)
      .where(and(eq(terminalSessions.port, port), eq(terminalSessions.status, 'ready')))
      .limit(1)
    if (existing) continue
    if (await portIsFree(port)) return port
  }
  throw new Error('No free ttyd port available')
}

/**
 * Start a ttyd process on the VPS as the environment's Linux user. Returns
 * the created session row. Caller is responsible for returning connection
 * details to the client; cleanup happens in endSession or via the TTL.
 */
export async function startTerminalSession(params: {
  userId: string
  environmentId: string
  cli: TerminalCli
}): Promise<TerminalSession> {
  const [env] = await db
    .select()
    .from(userEnvironments)
    .where(and(eq(userEnvironments.id, params.environmentId), eq(userEnvironments.userId, params.userId)))
    .limit(1)
  if (!env) throw new Error('Environment not found')
  if (env.status !== 'ready') throw new Error('Environment not ready')

  const port = await findAvailablePort()
  const token = randomBytes(24).toString('base64url')
  const sessionId = generateId(16)

  const loginCmd = CLI_LOGIN_COMMANDS[params.cli]

  // Note: `ttyd` runs as the user (via execAsUser -> sudo -u <user>) so the
  // login state ends up in $HOME. `--once` ensures the process exits after
  // the first client disconnects, and `-c session:<token>` adds HTTP basic
  // auth so random external scanners can't hijack the port.
  const ttydCmd = [
    'nohup',
    'ttyd',
    '--once',
    '--writable',
    `-p ${port}`,
    `-i 127.0.0.1`,
    `-c session:${token}`,
    `-t titleFixed='${params.cli} login'`,
    `bash -lc ${shellEscapeWrap(loginCmd)}`,
    '> /dev/null 2>&1 & echo $!',
  ].join(' ')

  await db.insert(terminalSessions).values({
    id: sessionId,
    userId: params.userId,
    environmentId: params.environmentId,
    linuxUsername: env.linuxUsername,
    cli: params.cli,
    port,
    token,
    status: 'starting',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })

  try {
    const result = await execAsUser(env.linuxUsername, ttydCmd, { timeoutMs: 10000, maxRetries: 1 })
    if (result.exitCode !== 0) {
      await db
        .update(terminalSessions)
        .set({ status: 'error', errorMessage: result.stderr.slice(0, 512), closedAt: new Date() })
        .where(eq(terminalSessions.id, sessionId))
      throw new Error('Failed to spawn terminal')
    }
    const pid = parseInt(result.stdout.trim(), 10) || null

    // Give ttyd a moment to bind.
    await new Promise((r) => setTimeout(r, 500))

    await db.update(terminalSessions).set({ status: 'ready', pid }).where(eq(terminalSessions.id, sessionId))

    const [row] = await db.select().from(terminalSessions).where(eq(terminalSessions.id, sessionId)).limit(1)
    return row!
  } catch (err) {
    await db
      .update(terminalSessions)
      .set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message.slice(0, 512) : 'unknown',
        closedAt: new Date(),
      })
      .where(eq(terminalSessions.id, sessionId))
    throw err
  }
}

/**
 * Close a running ttyd session. Best-effort: kills the process if we have a
 * pid, and flips the DB row to `closed`.
 */
export async function endTerminalSession(params: { userId: string; sessionId: string }): Promise<void> {
  const [row] = await db
    .select()
    .from(terminalSessions)
    .where(and(eq(terminalSessions.id, params.sessionId), eq(terminalSessions.userId, params.userId)))
    .limit(1)
  if (!row) return
  if (row.status === 'closed') return

  if (row.pid) {
    try {
      await execAsRoot(`kill ${row.pid} 2>/dev/null || true`, { timeoutMs: 5000, maxRetries: 1 })
    } catch {
      // Non-fatal: ttyd may already be gone
    }
  }

  await db
    .update(terminalSessions)
    .set({ status: 'closed', closedAt: new Date() })
    .where(eq(terminalSessions.id, params.sessionId))
}

/**
 * Mark expired sessions as closed. Called opportunistically on session create.
 */
export async function reapExpiredSessions(): Promise<void> {
  const now = new Date()
  const stale = await db
    .select()
    .from(terminalSessions)
    .where(and(eq(terminalSessions.status, 'ready')))
  for (const row of stale) {
    if (row.expiresAt > now) continue
    try {
      if (row.pid) {
        await execAsRoot(`kill ${row.pid} 2>/dev/null || true`, { timeoutMs: 5000, maxRetries: 1 })
      }
    } catch {
      // ignore
    }
    await db.update(terminalSessions).set({ status: 'closed', closedAt: now }).where(eq(terminalSessions.id, row.id))
  }
}

function shellEscapeWrap(s: string): string {
  return `'${shellEscapeSingleQuoted(s)}'`
}
