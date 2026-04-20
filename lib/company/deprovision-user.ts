import 'server-only'

import { db } from '@/lib/db/client'
import { userEnvironments } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { execAsRoot, shellEscapeSingleQuoted } from './vps-client'
import type { UserEnvironment } from '@/lib/db/schema'

function shellQuote(s: string) {
  return `'${shellEscapeSingleQuoted(s)}'`
}

/**
 * Delete the Linux user + home directory on the VPS and mark the env row deprovisioned.
 *
 * Idempotent: works even if the user account was already removed. Does not
 * delete the DB row so we preserve audit trail (status=deprovisioned).
 */
export async function deprovisionUserEnv(params: {
  userId: string
  workspaceId: string
}): Promise<UserEnvironment | null> {
  const { userId, workspaceId } = params

  const [env] = await db
    .select()
    .from(userEnvironments)
    .where(and(eq(userEnvironments.userId, userId), eq(userEnvironments.workspaceId, workspaceId)))
    .limit(1)

  if (!env) return null

  // `userdel -r` removes the home directory too. `|| true` tolerates already-gone.
  const script = [
    // Kill any running processes owned by this user before userdel.
    `pkill -KILL -u ${shellQuote(env.linuxUsername)} 2>/dev/null || true`,
    `userdel -r ${shellQuote(env.linuxUsername)} 2>/dev/null || true`,
  ].join(' && ')

  try {
    await execAsRoot(script, { timeoutMs: 30000, maxRetries: 2 })
  } catch (err) {
    console.error('userdel failed:', err instanceof Error ? err.message : err)
  }

  const [updated] = await db
    .update(userEnvironments)
    .set({
      status: 'deprovisioned',
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(userEnvironments.id, env.id))
    .returning()

  return updated
}
