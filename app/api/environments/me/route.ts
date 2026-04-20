import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { db } from '@/lib/db/client'
import { userEnvironments, userEnvClis, workspaceMembers, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { and, eq, desc } from 'drizzle-orm'
import { refreshCliStatus } from '@/lib/company/cli-install'
import { provisionUserEnvAsync } from '@/lib/company/provision-user'

/**
 * GET /api/environments/me
 *
 * Returns the calling user's persistent Linux environment status for the
 * requested workspace (or their first workspace if none specified), plus the
 * per-CLI install + auth matrix.
 *
 * Query params:
 *   - workspaceId (optional): which workspace's env to fetch
 *   - refresh=1   (optional): re-probe CLI auth state before returning
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const workspaceId = url.searchParams.get('workspaceId')
    const refresh = url.searchParams.get('refresh') === '1'

    let targetWorkspaceId = workspaceId ?? undefined
    if (!targetWorkspaceId) {
      const [membership] = await db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, session.user.id))
        .orderBy(desc(workspaces.updatedAt))
        .limit(1)
      targetWorkspaceId = membership?.workspaceId
    }

    if (!targetWorkspaceId) {
      return NextResponse.json({ environment: null, clis: [], reason: 'no_workspace' })
    }

    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, session.user.id), eq(workspaceMembers.workspaceId, targetWorkspaceId)))
      .limit(1)

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const [env] = await db
      .select()
      .from(userEnvironments)
      .where(and(eq(userEnvironments.userId, session.user.id), eq(userEnvironments.workspaceId, targetWorkspaceId)))
      .limit(1)

    if (!env) {
      return NextResponse.json({ environment: null, clis: [], workspaceId: targetWorkspaceId })
    }

    if (refresh && env.status === 'ready') {
      try {
        await refreshCliStatus(env)
      } catch (err) {
        console.error('refreshCliStatus failed:', err instanceof Error ? err.message : err)
      }
    }

    const clis = await db.select().from(userEnvClis).where(eq(userEnvClis.environmentId, env.id))

    return NextResponse.json({
      environment: {
        id: env.id,
        workspaceId: env.workspaceId,
        linuxUsername: env.linuxUsername,
        homeDir: env.homeDir,
        status: env.status,
        errorMessage: env.errorMessage,
        provisionedAt: env.provisionedAt,
        lastActiveAt: env.lastActiveAt,
      },
      clis: clis.map((c) => ({
        cli: c.cli,
        installed: c.installed,
        authenticated: c.authenticated,
        authMethod: c.authMethod,
        lastCheckedAt: c.lastCheckedAt,
      })),
    })
  } catch (error) {
    console.error('environments/me error:', error)
    return NextResponse.json({ error: 'Failed to fetch environment' }, { status: 500 })
  }
}

/**
 * POST /api/environments/me
 * Body: { workspaceId }
 *
 * Trigger (or retry) provisioning of the caller's Linux environment on the
 * company VPS. Runs asynchronously; poll GET for status.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, session.user.id), eq(workspaceMembers.workspaceId, workspaceId)))
      .limit(1)
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    after(() => provisionUserEnvAsync({ userId: session.user.id, workspaceId }))

    return NextResponse.json({ ok: true, queued: true })
  } catch (error) {
    console.error('environments/me POST error:', error)
    return NextResponse.json({ error: 'Failed to queue provisioning' }, { status: 500 })
  }
}
