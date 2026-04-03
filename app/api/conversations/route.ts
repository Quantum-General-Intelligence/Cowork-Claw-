import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { conversations } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, desc } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, session.user.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(50)

    return NextResponse.json({ conversations: userConversations })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const [conversation] = await db
      .insert(conversations)
      .values({
        id: generateId(12),
        userId: session.user.id,
        title: body.title || 'New conversation',
      })
      .returning()

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
