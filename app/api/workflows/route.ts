import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workflows } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, desc } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.userId, session.user.id))
      .orderBy(desc(workflows.updatedAt))

    return NextResponse.json({ workflows: userWorkflows })
  } catch (error) {
    console.error('Error fetching workflows:', error)
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const [workflow] = await db
      .insert(workflows)
      .values({
        id: generateId(12),
        userId: session.user.id,
        name: body.name || 'Untitled Workflow',
        description: body.description,
        nodes: body.nodes || [],
        edges: body.edges || [],
      })
      .returning()

    return NextResponse.json({ workflow })
  } catch (error) {
    console.error('Error creating workflow:', error)
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 })
  }
}
