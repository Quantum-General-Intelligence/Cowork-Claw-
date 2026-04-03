import { db } from '@/lib/db/client'
import { activityEvents } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { dispatchNotifications } from '@/lib/notifications/dispatch'

export async function emitActivity(
  userId: string,
  eventType: string,
  entityType?: string,
  entityId?: string,
  data?: Record<string, unknown>,
  workspaceId?: string,
  actorId?: string,
) {
  try {
    const [event] = await db
      .insert(activityEvents)
      .values({
        id: generateId(12),
        userId,
        workspaceId: workspaceId || null,
        eventType,
        entityType: entityType || null,
        entityId: entityId || null,
        actorId: actorId || userId,
        data: data || null,
      })
      .returning()

    // Dispatch notifications based on event type
    await dispatchNotifications(event)

    return event
  } catch (error) {
    console.error('Failed to emit activity:', error)
    // Don't throw — activity tracking should never break the main flow
  }
}
