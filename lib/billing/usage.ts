import { db } from '@/lib/db/client'
import { usageMeters } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

export async function trackUsage(
  userId: string,
  type: 'api_call' | 'sandbox_start' | 'sandbox_minute',
  amount: number = 1,
) {
  try {
    const date = todayDate()

    // Upsert: try to update, if no row exists, insert
    const [existing] = await db
      .select()
      .from(usageMeters)
      .where(and(eq(usageMeters.userId, userId), eq(usageMeters.date, date)))
      .limit(1)

    if (existing) {
      const update: Record<string, unknown> = { updatedAt: new Date() }
      if (type === 'api_call') update.apiCalls = (existing.apiCalls || 0) + amount
      if (type === 'sandbox_start') update.sandboxCount = (existing.sandboxCount || 0) + amount
      if (type === 'sandbox_minute') update.sandboxMinutes = (existing.sandboxMinutes || 0) + amount

      await db.update(usageMeters).set(update).where(eq(usageMeters.id, existing.id))
    } else {
      await db.insert(usageMeters).values({
        id: generateId(12),
        userId,
        date,
        apiCalls: type === 'api_call' ? amount : 0,
        sandboxCount: type === 'sandbox_start' ? amount : 0,
        sandboxMinutes: type === 'sandbox_minute' ? amount : 0,
      })
    }
  } catch (error) {
    console.error('Failed to track usage:', error)
    // Don't throw — usage tracking should never break the main flow
  }
}

export async function getUsage(userId: string, date?: string) {
  const targetDate = date || todayDate()
  const [meter] = await db
    .select()
    .from(usageMeters)
    .where(and(eq(usageMeters.userId, userId), eq(usageMeters.date, targetDate)))
    .limit(1)

  return meter || { apiCalls: 0, sandboxMinutes: 0, sandboxCount: 0 }
}
