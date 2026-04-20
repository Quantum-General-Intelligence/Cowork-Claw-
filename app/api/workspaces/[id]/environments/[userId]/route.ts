import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { db } from '@/lib/db/client'
import { userEnvironments, workspaceMembers } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { and, eq } from 'drizzle-orm'
import { provisionUserEnvAsync, provisionUserEnv } from '@/lib/company/provision-user'
import { deprovisionUserEnv } from '@/lib/company/deprovision-user'
import { refreshCliStatus, resetCliAuth, type SupportedCli } from '@/lib/company/cli-install'

const VALID_CLIS: SupportedCli[] = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode']

async function requireAdmin(workspaceId: string, callerId: string) {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, callerId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1)
  return member && ['owner', 'admin'].includes(member.role)
}

/**
 * POST /api/workspaces/[id]/environments/[userId]
 * Body: { action: 'provision' | 'deprovision' | 'refresh' | 'reset-cli', cli?: SupportedCli }
 *
 * Admin-only per-member environment actions.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: workspaceId, userId: targetUserId } = await params

    if (!(await requireAdmin(workspaceId, session.user.id))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    const [targetMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, targetUserId), eq(workspaceMembers.workspaceId, workspaceId)))
      .limit(1)
    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    switch (action) {
      case 'provision': {
        after(() => provisionUserEnvAsync({ userId: targetUserId, workspaceId }))
        return NextResponse.json({ ok: true, queued: true })
      }

      case 'deprovision': {
        const result = await deprovisionUserEnv({ userId: targetUserId, workspaceId })
        return NextResponse.json({ ok: true, environment: result })
      }

      case 'refresh': {
        const [env] = await db
          .select()
          .from(userEnvironments)
          .where(and(eq(userEnvironments.userId, targetUserId), eq(userEnvironments.workspaceId, workspaceId)))
          .limit(1)
        if (!env) {
          return NextResponse.json({ error: 'No environment' }, { status: 404 })
        }
        if (env.status !== 'ready') {
          return NextResponse.json({ error: 'Environment not ready' }, { status: 409 })
        }
        await refreshCliStatus(env)
        return NextResponse.json({ ok: true })
      }

      case 'reset-cli': {
        const cli = body.cli as SupportedCli | undefined
        if (!cli || !VALID_CLIS.includes(cli)) {
          return NextResponse.json({ error: 'Invalid cli' }, { status: 400 })
        }
        const [env] = await db
          .select()
          .from(userEnvironments)
          .where(and(eq(userEnvironments.userId, targetUserId), eq(userEnvironments.workspaceId, workspaceId)))
          .limit(1)
        if (!env || env.status !== 'ready') {
          return NextResponse.json({ error: 'Environment not ready' }, { status: 409 })
        }
        await resetCliAuth(env, cli)
        return NextResponse.json({ ok: true })
      }

      case 'reprovision': {
        await deprovisionUserEnv({ userId: targetUserId, workspaceId })
        const env = await provisionUserEnv({ userId: targetUserId, workspaceId })
        return NextResponse.json({ ok: true, environment: env })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('workspace environment action error:', error)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
