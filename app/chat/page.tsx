import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { OpenClawChat } from '@/components/openclaw-chat'
import { cookies } from 'next/headers'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cowork - AI Agent Team',
  description: 'Chat with OpenClaw to coordinate AI coding agents on your projects.',
}

export default async function ChatPage() {
  const session = await getServerSession()
  const stars = await getGitHubStars()
  const cookieStore = await cookies()

  const selectedOwner = cookieStore.get('selected-owner')?.value || ''
  const selectedRepo = cookieStore.get('selected-repo')?.value || ''

  return (
    <OpenClawChat
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
      selectedOwner={selectedOwner}
      selectedRepo={selectedRepo}
    />
  )
}
