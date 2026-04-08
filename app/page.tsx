import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { OpenClawChat } from '@/components/openclaw-chat'
import { LandingPage } from '@/components/landing-page'
import { cookies } from 'next/headers'

export default async function Home() {
  const session = await getServerSession()

  if (!session?.user) {
    return <LandingPage />
  }

  const stars = await getGitHubStars()
  const cookieStore = await cookies()

  const selectedOwner = cookieStore.get('selected-owner')?.value || ''
  const selectedRepo = cookieStore.get('selected-repo')?.value || ''

  return (
    <OpenClawChat
      user={session.user}
      authProvider={session.authProvider ?? null}
      initialStars={stars}
      selectedOwner={selectedOwner}
      selectedRepo={selectedRepo}
    />
  )
}
