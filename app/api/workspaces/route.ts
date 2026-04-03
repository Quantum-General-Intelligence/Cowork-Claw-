import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workspaces, workspaceMembers } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, desc } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspaces where user is a member
    const memberships = await db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, session.user.id))
      .orderBy(desc(workspaces.updatedAt))

    return NextResponse.json({
      workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
    })
  } catch (error) {
    console.error('Error fetching workspaces:', error)
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const workspaceId = generateId(12)

    const [workspace] = await db
      .insert(workspaces)
      .values({
        id: workspaceId,
        name,
        slug,
        ownerId: session.user.id,
        description: body.description,
      })
      .returning()

    // Add creator as owner member
    await db.insert(workspaceMembers).values({
      id: generateId(12),
      workspaceId,
      userId: session.user.id,
      role: 'owner',
    })

    return NextResponse.json({ workspace })
  } catch (error) {
    console.error('Error creating workspace:', error)
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }
}
