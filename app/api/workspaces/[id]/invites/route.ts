import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workspaceInvites, workspaceMembers } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, and, isNull } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { nanoid } from 'nanoid'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const invites = await db
      .select()
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, id), isNull(workspaceInvites.acceptedAt)))

    return NextResponse.json({ invites })
  } catch (error) {
    console.error('Error fetching invites:', error)
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    if (!body.email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Verify caller is admin/owner
    const [callerMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, session.user.id)))
      .limit(1)

    if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const token = nanoid(32)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const [invite] = await db
      .insert(workspaceInvites)
      .values({
        id: generateId(12),
        workspaceId: id,
        email: body.email,
        role: body.role || 'member',
        token,
        expiresAt,
      })
      .returning()

    return NextResponse.json({ invite, inviteUrl: `/invite/${token}` })
  } catch (error) {
    console.error('Error creating invite:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}
