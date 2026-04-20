import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { terminalSessions } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { endTerminalSession } from '@/lib/company/terminal-session'

/**
 * GET /api/terminal/session/[sessionId]
 * Returns the current status of a terminal session the caller owns.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId } = await params
  const [row] = await db
    .select()
    .from(terminalSessions)
    .where(and(eq(terminalSessions.id, sessionId), eq(terminalSessions.userId, session.user.id)))
    .limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    sessionId: row.id,
    status: row.status,
    cli: row.cli,
    expiresAt: row.expiresAt,
    closedAt: row.closedAt,
    errorMessage: row.errorMessage,
  })
}

/**
 * DELETE /api/terminal/session/[sessionId]
 * Ends the ttyd process and marks the session closed.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId } = await params
  try {
    await endTerminalSession({ userId: session.user.id, sessionId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('terminal session DELETE error:', error)
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 })
  }
}
