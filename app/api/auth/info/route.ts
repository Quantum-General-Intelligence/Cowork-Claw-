import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { accounts, users } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { SessionUserInfo } from '@/lib/session/types'

export async function GET() {
  const session = await getServerSession()

  if (!session) {
    const data: SessionUserInfo = { user: undefined }
    return Response.json(data)
  }

  let githubConnected = session.authProvider === 'github'
  if (!githubConnected && session.user?.id) {
    const [linked] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)
    githubConnected = !!linked
    if (!githubConnected) {
      const [legacy] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, session.user.id), eq(users.provider, 'github')))
        .limit(1)
      githubConnected = !!legacy
    }
  }

  const data: SessionUserInfo = {
    user: session.user,
    authProvider: session.authProvider,
    githubConnected,
  }

  return Response.json(data)
}
