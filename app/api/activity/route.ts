import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { activityEvents } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const events = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, session.user.id))
      .orderBy(desc(activityEvents.createdAt))
      .limit(100)

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Error fetching activity:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}
