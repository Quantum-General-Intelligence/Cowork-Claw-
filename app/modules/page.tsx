import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { ModulesHub } from '@/components/modules-hub'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Modules - Coding Agent Platform',
  description: 'Browse integrated modules for browser automation, generative UI, workflows, and more.',
}

export default async function ModulesPage() {
  const session = await getServerSession()
  const stars = await getGitHubStars()

  return <ModulesHub user={session?.user ?? null} authProvider={session?.authProvider ?? null} initialStars={stars} />
}
