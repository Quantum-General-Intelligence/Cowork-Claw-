import { db } from '@/lib/db/client'
import { notifications, workspaceMembers, type ActivityEvent } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { eq } from 'drizzle-orm'

const EVENT_NOTIFICATIONS: Record<string, { title: (data: Record<string, unknown>) => string; type: string }> = {
  task_completed: {
    title: () => 'Task completed',
    type: 'task_complete',
  },
  task_error: {
    title: () => 'Task failed',
    type: 'task_error',
  },
  pr_created: {
    title: () => 'Pull request created',
    type: 'pr_created',
  },
  pr_merged: {
    title: () => 'Pull request merged',
    type: 'pr_merged',
  },
}

export async function dispatchNotifications(event: ActivityEvent) {
  try {
    const config = EVENT_NOTIFICATIONS[event.eventType]
    if (!config) return // No notifications for this event type

    const recipientIds = new Set<string>()

    // Always notify the task/entity owner
    recipientIds.add(event.userId)

    // If workspace event, notify workspace members
    if (event.workspaceId) {
      const members = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, event.workspaceId))

      for (const member of members) {
        recipientIds.add(member.userId)
      }
    }

    // Don't notify the actor (the person who triggered the event)
    if (event.actorId) {
      recipientIds.delete(event.actorId)
    }

    // Create notifications for each recipient
    const notificationValues = Array.from(recipientIds).map((userId) => ({
      id: generateId(12),
      userId,
      type: config.type,
      title: config.title((event.data as Record<string, unknown>) || {}),
      message: event.eventType,
      actionUrl: event.entityType === 'task' ? `/tasks/${event.entityId}` : null,
      relatedEntityType: event.entityType,
      relatedEntityId: event.entityId,
    }))

    if (notificationValues.length > 0) {
      await db.insert(notifications).values(notificationValues)
    }
  } catch (error) {
    console.error('Failed to dispatch notifications:', error)
  }
}
