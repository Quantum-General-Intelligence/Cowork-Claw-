import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const STALE_PROCESSING_MS = 60 * 60 * 1000 // 1h

/**
 * Mark long-running `processing` tasks as failed on app boot.
 *
 * In the persistent-env model there are no sandbox containers to health-check,
 * so we simply assume that any task stuck in `processing` longer than
 * `STALE_PROCESSING_MS` is the result of a crash or restart and flip it to
 * `error`. The workdir inside the user's home dir stays intact.
 */
export async function reconcileStaleTasks(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MS)
    const staleTasks = await db.select().from(tasks).where(eq(tasks.status, 'processing'))

    if (staleTasks.length === 0) return

    let reconciled = 0
    for (const task of staleTasks) {
      if (task.updatedAt > cutoff) continue
      await db
        .update(tasks)
        .set({ status: 'error', updatedAt: new Date() })
        .where(and(eq(tasks.id, task.id), eq(tasks.status, 'processing')))
      reconciled++
    }

    if (reconciled > 0) {
      console.log('Reconciled stale tasks')
    }
  } catch {
    console.error('Task reconciliation failed')
  }
}
