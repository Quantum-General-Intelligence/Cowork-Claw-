import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { redirect } from 'next/navigation'
import { WorkflowsListClient } from '@/components/workflows-list-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workflows - Cowork-Claw',
  description: 'Visual agent orchestration workflows.',
}

export default async function WorkflowsPage() {
  const session = await getServerSession()
  const stars = await getGitHubStars()

  if (!session?.user) {
    redirect('/')
  }

  return <WorkflowsListClient user={session.user} authProvider={session.authProvider} initialStars={stars} />
}
