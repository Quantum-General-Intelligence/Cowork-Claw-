import 'server-only'

import { db } from '@/lib/db/client'
import { users, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { decrypt } from '@/lib/crypto'

/**
 * Get the GitHub access token for the currently authenticated user.
 * Returns null if the user is not authenticated or has not connected GitHub.
 *
 * Token sources (in order):
 * 1. users.accessToken - for users who signed in with GitHub (primary provider)
 * 2. accounts.accessToken - for users who later linked GitHub to another primary
 */
export async function getUserGitHubToken(): Promise<string | null> {
  const session = await getServerSession()

  if (!session?.user?.id) {
    return null
  }

  try {
    const user = await db
      .select({ accessToken: users.accessToken })
      .from(users)
      .where(and(eq(users.id, session.user.id), eq(users.provider, 'github')))
      .limit(1)

    if (user[0]?.accessToken) {
      return decrypt(user[0].accessToken)
    }

    const account = await db
      .select({ accessToken: accounts.accessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)

    if (account[0]?.accessToken) {
      return decrypt(account[0].accessToken)
    }

    return null
  } catch (error) {
    console.error('Error fetching user GitHub token:', error)
    return null
  }
}
