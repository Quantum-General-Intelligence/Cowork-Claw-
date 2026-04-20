import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { userEnvironments, userEnvClis, workspaceMembers, users } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { and, eq } from 'drizzle-orm'

/**
 * GET /api/workspaces/[id]/environments
 *
 * Admin-only. Returns the environment status for every member of the workspace,
 * joined with their user profile + CLI matrix.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: workspaceId } = await params

    const [caller] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, session.user.id), eq(workspaceMembers.workspaceId, workspaceId)))
      .limit(1)

    if (!caller || !['owner', 'admin'].includes(caller.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const rows = await db
      .select({
        member: workspaceMembers,
        user: users,
        environment: userEnvironments,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .leftJoin(
        userEnvironments,
        and(
          eq(userEnvironments.userId, workspaceMembers.userId),
          eq(userEnvironments.workspaceId, workspaceMembers.workspaceId),
        ),
      )
      .where(eq(workspaceMembers.workspaceId, workspaceId))

    const envIds = rows.map((r) => r.environment?.id).filter((id): id is string => Boolean(id))
    const cliRows = envIds.length ? await db.select().from(userEnvClis) : []

    const clisByEnv = new Map<string, typeof cliRows>()
    for (const row of cliRows) {
      if (!envIds.includes(row.environmentId)) continue
      const arr = clisByEnv.get(row.environmentId) ?? []
      arr.push(row)
      clisByEnv.set(row.environmentId, arr)
    }

    return NextResponse.json({
      members: rows.map((r) => ({
        userId: r.user.id,
        username: r.user.username,
        email: r.user.email,
        name: r.user.name,
        role: r.member.role,
        environment: r.environment
          ? {
              id: r.environment.id,
              linuxUsername: r.environment.linuxUsername,
              homeDir: r.environment.homeDir,
              status: r.environment.status,
              errorMessage: r.environment.errorMessage,
              provisionedAt: r.environment.provisionedAt,
              lastActiveAt: r.environment.lastActiveAt,
            }
          : null,
        clis: r.environment
          ? (clisByEnv.get(r.environment.id) ?? []).map((c) => ({
              cli: c.cli,
              installed: c.installed,
              authenticated: c.authenticated,
              authMethod: c.authMethod,
              lastCheckedAt: c.lastCheckedAt,
            }))
          : [],
      })),
    })
  } catch (error) {
    console.error('workspace environments GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch environments' }, { status: 500 })
  }
}
