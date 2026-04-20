import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { tasks, userEnvironments } from '@/lib/db/schema'
import { UserEnvInstance } from './user-env-instance'

/**
 * Resolve the persistent-environment instance associated with a task.
 *
 * Returns `null` when:
 *   - the task does not exist (or is soft-deleted)
 *   - the task does not belong to the given user
 *   - the task has no environmentId/workdir yet (hasn't started running)
 *   - the user environment is not ready
 *
 * Use this from any route that used to reach into a Docker sandbox registry.
 * The returned instance's `projectDir` points at the task's workdir inside the
 * user's home directory on the VPS.
 */
export async function getEnvInstanceForTask(
  taskId: string,
  userId: string,
): Promise<{ instance: UserEnvInstance; workdir: string; environmentId: string } | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1)

  if (!task) return null
  if (!task.environmentId || !task.workdir) return null

  const [env] = await db.select().from(userEnvironments).where(eq(userEnvironments.id, task.environmentId)).limit(1)
  if (!env || env.status !== 'ready') return null

  const instance = new UserEnvInstance({
    environmentId: env.id,
    linuxUsername: env.linuxUsername,
    projectDir: task.workdir,
  })

  return { instance, workdir: task.workdir, environmentId: env.id }
}
