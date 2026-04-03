import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workspaceMembers, users } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const members = await db
      .select({
        id: workspaceMembers.id,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
        userId: users.id,
        username: users.username,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, id))

    return NextResponse.json({ members })
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
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

    // Verify caller is admin/owner
    const [callerMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, session.user.id)))
      .limit(1)

    if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const [member] = await db
      .insert(workspaceMembers)
      .values({
        id: generateId(12),
        workspaceId: id,
        userId: body.userId,
        role: body.role || 'member',
      })
      .returning()

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Error adding member:', error)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { userId } = await req.json()

    // Verify caller is admin/owner
    const [callerMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, session.user.id)))
      .limit(1)

    if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
