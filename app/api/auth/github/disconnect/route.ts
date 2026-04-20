import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { removeGitHubConnection } from '@/lib/auth/github-connection'

export async function POST() {
  const session = await getServerSession()

  if (!session?.user?.id) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (session.authProvider === 'github') {
    return Response.json({ error: 'Cannot disconnect primary authentication method' }, { status: 400 })
  }

  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Unlink the GitHub identity from the Supabase auth user (best-effort).
    // Requires "Manual Linking" to be enabled in Supabase Auth settings.
    const { data: identitiesData } = await supabase.auth.getUserIdentities()
    const githubIdentity = identitiesData?.identities?.find((identity) => identity.provider === 'github')
    if (githubIdentity) {
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(githubIdentity)
      if (unlinkError) {
        console.error('Supabase unlinkIdentity error:', unlinkError)
      }
    }

    await removeGitHubConnection(session.user.id)
    return Response.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
