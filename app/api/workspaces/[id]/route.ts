import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workspaces, workspaceMembers } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, and } from 'drizzle-orm'

async function verifyMembership(workspaceId: string, userId: string) {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return member
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const member = await verifyMembership(id, session.user.id)
    if (!member) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)

    const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, id))

    return NextResponse.json({ workspace, members, currentRole: member.role })
  } catch (error) {
    console.error('Error fetching workspace:', error)
    return NextResponse.json({ error: 'Failed to fetch workspace' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const member = await verifyMembership(id, session.user.id)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await req.json()

    const [workspace] = await db
      .update(workspaces)
      .set({ name: body.name, description: body.description, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning()

    return NextResponse.json({ workspace })
  } catch (error) {
    console.error('Error updating workspace:', error)
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Only owner can delete
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, session.user.id)))
      .limit(1)

    if (!workspace) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await db.delete(workspaces).where(eq(workspaces.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting workspace:', error)
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 })
  }
}
