import { getServerSession } from '@/lib/session/get-server-session'
import type { SessionUserInfo } from '@/lib/session/types'

export async function GET() {
  const session = await getServerSession()

  const data: SessionUserInfo = session
    ? { user: session.user, authProvider: session.authProvider }
    : { user: undefined }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}
