import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { users, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET() {
  const session = await getServerSession()

  if (!session?.user?.id) {
    return Response.json({ connected: false })
  }

  try {
    const [account] = await db
      .select({ username: accounts.username, createdAt: accounts.createdAt })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)

    if (account) {
      return Response.json({
        connected: true,
        username: account.username,
        connectedAt: account.createdAt,
      })
    }

    // Legacy fallback for users whose GitHub token was saved on the users row
    // before the accounts-table consolidation.
    const [user] = await db
      .select({ username: users.username, createdAt: users.createdAt })
      .from(users)
      .where(and(eq(users.id, session.user.id), eq(users.provider, 'github')))
      .limit(1)

    if (user) {
      return Response.json({
        connected: true,
        username: user.username,
        connectedAt: user.createdAt,
      })
    }

    return Response.json({ connected: false })
  } catch (error) {
    console.error('Error checking GitHub connection status:', error)
    return Response.json({ connected: false, error: 'Failed to check status' }, { status: 500 })
  }
}
