import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, desc, isNull, and } from 'drizzle-orm'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, session.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    const unreadCount = allNotifications.filter((n) => !n.readAt).length

    return NextResponse.json({ notifications: allNotifications, unreadCount })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    if (body.markAllRead) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))
    } else if (body.notificationId) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, body.notificationId), eq(notifications.userId, session.user.id)))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating notifications:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
