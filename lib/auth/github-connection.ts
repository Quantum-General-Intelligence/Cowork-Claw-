import 'server-only'

import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encrypt } from '@/lib/crypto'
import type { User as SupabaseUser } from '@supabase/supabase-js'

type PersistArgs = {
  userId: string
  providerToken: string
  providerRefreshToken?: string | null
  scope?: string | null
  supabaseUser: SupabaseUser
}

/**
 * Persist a GitHub OAuth token for a user in the `accounts` table.
 *
 * Called from the Supabase auth callback when the most-recent authentication
 * was the GitHub provider (either a primary sign-in or a linkIdentity flow).
 * Tokens are encrypted at rest via the same key used by the rest of the app.
 */
export async function persistGitHubConnection({
  userId,
  providerToken,
  providerRefreshToken,
  scope,
  supabaseUser,
}: PersistArgs) {
  const githubIdentity = supabaseUser.identities?.find((identity) => identity.provider === 'github')
  const identityData = (githubIdentity?.identity_data ?? {}) as Record<string, unknown>

  const externalUserId = String(githubIdentity?.id ?? identityData.provider_id ?? identityData.sub ?? supabaseUser.id)
  const username =
    (typeof identityData.user_name === 'string' && identityData.user_name) ||
    (typeof identityData.preferred_username === 'string' && identityData.preferred_username) ||
    (typeof supabaseUser.user_metadata?.user_name === 'string' && supabaseUser.user_metadata.user_name) ||
    externalUserId

  const encryptedAccess = encrypt(providerToken)
  const encryptedRefresh = providerRefreshToken ? encrypt(providerRefreshToken) : null

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1)

  if (existing) {
    await db
      .update(accounts)
      .set({
        externalUserId,
        username,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        scope: scope ?? null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existing.id))
    return
  }

  await db.insert(accounts).values({
    id: nanoid(),
    userId,
    provider: 'github',
    externalUserId,
    username,
    accessToken: encryptedAccess,
    refreshToken: encryptedRefresh,
    scope: scope ?? null,
  })
}

/**
 * Remove the stored GitHub connection for a user. Idempotent.
 */
export async function removeGitHubConnection(userId: string) {
  await db.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
}
