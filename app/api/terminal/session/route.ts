import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { startTerminalSession, reapExpiredSessions, type TerminalCli } from '@/lib/company/terminal-session'
import { db } from '@/lib/db/client'
import { userEnvironments } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const ALLOWED_CLIS: TerminalCli[] = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode', 'bash']

/**
 * POST /api/terminal/session
 *
 * Body: { environmentId: string; cli: TerminalCli }
 *
 * Spawns a one-shot `ttyd` process on the VPS bound to 127.0.0.1, returns the
 * connection details required for the client to iframe the terminal via the
 * configured reverse proxy (TERMINAL_PROXY_URL).
 *
 * Security: caller must own the environment; each session issues a fresh
 * random HTTP basic-auth token; ttyd runs with `--once` so it dies after the
 * first client disconnects.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const environmentId = typeof body.environmentId === 'string' ? body.environmentId : null
    const cli = typeof body.cli === 'string' ? (body.cli as TerminalCli) : null

    if (!environmentId || !cli || !ALLOWED_CLIS.includes(cli)) {
      return NextResponse.json({ error: 'environmentId and valid cli are required' }, { status: 400 })
    }

    const [env] = await db
      .select()
      .from(userEnvironments)
      .where(and(eq(userEnvironments.id, environmentId), eq(userEnvironments.userId, session.user.id)))
      .limit(1)
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 })
    }

    await reapExpiredSessions().catch((err) => {
      console.error('reapExpiredSessions failed:', err instanceof Error ? err.message : err)
    })

    const row = await startTerminalSession({
      userId: session.user.id,
      environmentId,
      cli,
    })

    // The client iframes <TERMINAL_PROXY_URL>/<port>/ and the VPS reverse proxy
    // forwards to 127.0.0.1:<port>. See scripts/install-vps-clis.sh for the
    // matching Caddyfile snippet.
    const proxyBase = process.env.TERMINAL_PROXY_URL || ''
    const connectUrl = proxyBase ? `${proxyBase.replace(/\/$/, '')}/${row.port}/` : ''

    if (!connectUrl) {
      return NextResponse.json(
        {
          error:
            'Terminal reverse proxy not configured. Set TERMINAL_PROXY_URL env var — see scripts/install-vps-clis.sh.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json({
      sessionId: row.id,
      status: row.status,
      cli: row.cli,
      expiresAt: row.expiresAt.toISOString(),
      connectUrl,
      // Basic auth credentials the client must inject as Authorization header
      // when loading the terminal URL (or included in the URL for iframes).
      basicAuthUser: 'session',
      basicAuthToken: row.token,
      errorMessage: row.errorMessage,
    })
  } catch (error) {
    console.error('terminal session start error:', error)
    return NextResponse.json({ error: 'Failed to start terminal session' }, { status: 500 })
  }
}
