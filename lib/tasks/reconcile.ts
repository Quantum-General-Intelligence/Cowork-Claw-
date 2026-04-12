import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSandboxProvider } from '@/lib/sandbox/factory'

/**
 * On app startup, find any tasks stuck in 'processing' status and check
 * if their sandbox containers are still running. If not, mark them as failed.
 *
 * Called once from a server-side module on app boot.
 */
export async function reconcileStaleTasks(): Promise<void> {
  try {
    const staleTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.status, 'processing'))

    if (staleTasks.length === 0) return

    const provider = getSandboxProvider()
    let reconciled = 0

    for (const task of staleTasks) {
      if (!task.sandboxId) {
        // No sandbox ID — task never started, mark as error
        await db
          .update(tasks)
          .set({ status: 'error', updatedAt: new Date() })
          .where(eq(tasks.id, task.id))
        reconciled++
        continue
      }

      try {
        // Check if sandbox is still running
        await provider.get({ sandboxId: task.sandboxId })
        // Still running — leave it alone
      } catch {
        // Sandbox is gone — mark task as error
        await db
          .update(tasks)
          .set({ status: 'error', updatedAt: new Date() })
          .where(eq(tasks.id, task.id))
        reconciled++
      }
    }

    if (reconciled > 0) {
      console.log('Reconciled stale tasks')
    }
  } catch {
    console.error('Task reconciliation failed')
  }
}
