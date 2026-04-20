import 'server-only'

import { db } from '@/lib/db/client'
import { userEnvironments, userEnvClis, users, workspaces, workspaceMembers } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { generateLinuxUsername } from './linux-username'
import { execAsRoot, shellEscapeSingleQuoted } from './vps-client'
import type { UserEnvironment } from '@/lib/db/schema'

const SUPPORTED_CLIS = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode'] as const

/**
 * Ensure a row exists in `user_environments` for (userId, workspaceId).
 * Returns the env row (possibly with `status=pending`).
 */
async function ensureEnvRow(userId: string, workspaceId: string, email: string | null): Promise<UserEnvironment> {
  const [existing] = await db
    .select()
    .from(userEnvironments)
    .where(and(eq(userEnvironments.userId, userId), eq(userEnvironments.workspaceId, workspaceId)))
    .limit(1)

  if (existing) return existing

  const linuxUsername = generateLinuxUsername(userId, email)
  const homeDir = `/home/${linuxUsername}`

  const [created] = await db
    .insert(userEnvironments)
    .values({
      id: generateId(16),
      userId,
      workspaceId,
      linuxUsername,
      homeDir,
      status: 'pending',
    })
    .returning()

  return created
}

async function seedCliRows(environmentId: string) {
  for (const cli of SUPPORTED_CLIS) {
    await db
      .insert(userEnvClis)
      .values({
        id: generateId(16),
        environmentId,
        cli,
        installed: false,
        authenticated: false,
      })
      .onConflictDoNothing()
  }
}

function shellQuote(s: string) {
  return `'${shellEscapeSingleQuoted(s)}'`
}

/**
 * Provision a Linux user on the VPS for the given (user, workspace) pair.
 *
 * Idempotent: if the env row is already `ready`, returns it unchanged.
 * Otherwise runs useradd + home bootstrap and flips the row to `ready`.
 */
export async function provisionUserEnv(params: { userId: string; workspaceId: string }): Promise<UserEnvironment> {
  const { userId, workspaceId } = params

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw new Error('user not found')

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  if (!workspace) throw new Error('workspace not found')

  const env = await ensureEnvRow(userId, workspaceId, user.email)

  if (env.status === 'ready') {
    return env
  }

  await db
    .update(userEnvironments)
    .set({ status: 'provisioning', errorMessage: null, updatedAt: new Date() })
    .where(eq(userEnvironments.id, env.id))

  try {
    const u = env.linuxUsername
    const home = env.homeDir

    // Build a single composite shell command so we don't pay 6+ SSH round-trips.
    // `|| true` on useradd for idempotence: re-runs after a partial failure work.
    const script = [
      // Create user if missing (locked password — key-based access only via sudo).
      `id -u ${shellQuote(u)} >/dev/null 2>&1 || useradd --create-home --shell /bin/bash ${shellQuote(u)}`,
      `usermod -L ${shellQuote(u)}`,
      // Ensure cowork group exists and user is in it.
      `getent group cowork >/dev/null 2>&1 || groupadd cowork`,
      `usermod -a -G cowork ${shellQuote(u)}`,
      // Bootstrap home layout.
      `install -d -m 700 -o ${shellQuote(u)} -g ${shellQuote(u)} ${shellQuote(home + '/.cowork')}`,
      `install -d -m 755 -o ${shellQuote(u)} -g ${shellQuote(u)} ${shellQuote(home + '/tasks')}`,
      `install -d -m 755 -o ${shellQuote(u)} -g ${shellQuote(u)} ${shellQuote(home + '/projects')}`,
      `install -d -m 700 -o ${shellQuote(u)} -g ${shellQuote(u)} ${shellQuote(home + '/.config')}`,
      `install -d -m 700 -o ${shellQuote(u)} -g ${shellQuote(u)} ${shellQuote(home + '/.ssh')}`,
      // Lock the home so other users can't list it.
      `chmod 750 ${shellQuote(home)}`,
      // Marker file so the app can verify provisioning worked.
      `echo 'provisioned' > ${shellQuote(home + '/.cowork/ready')}`,
      `chown ${shellQuote(u)}:${shellQuote(u)} ${shellQuote(home + '/.cowork/ready')}`,
    ].join(' && ')

    const result = await execAsRoot(script, { timeoutMs: 60000, maxRetries: 2 })

    if (result.exitCode !== 0) {
      console.error('Provision script failed:', result.stderr)
      throw new Error('useradd / home bootstrap failed')
    }

    await seedCliRows(env.id)

    const [ready] = await db
      .update(userEnvironments)
      .set({
        status: 'ready',
        errorMessage: null,
        provisionedAt: new Date(),
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userEnvironments.id, env.id))
      .returning()

    return ready
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown provisioning error'
    console.error('provisionUserEnv error:', msg)
    await db
      .update(userEnvironments)
      .set({ status: 'error', errorMessage: msg, updatedAt: new Date() })
      .where(eq(userEnvironments.id, env.id))
    throw err
  }
}

/**
 * Fire-and-forget provisioning for use in request handlers.
 * Logs on error, doesn't throw.
 */
export async function provisionUserEnvAsync(params: { userId: string; workspaceId: string }): Promise<void> {
  try {
    await provisionUserEnv(params)
  } catch (err) {
    console.error('Background provisioning failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Find or create the env for a user's primary workspace (first membership).
 * Returns null if the user isn't a member of any workspace yet.
 */
export async function getOrProvisionEnvForUser(userId: string): Promise<UserEnvironment | null> {
  const [member] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)

  if (!member) return null

  return provisionUserEnv({ userId, workspaceId: member.workspaceId })
}
