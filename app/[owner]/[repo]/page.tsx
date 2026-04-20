import { cookies } from 'next/headers'
import { HomePageContent } from '@/components/home-page-content'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'

interface OwnerRepoPageProps {
  params: Promise<{
    owner: string
    repo: string
  }>
}

export default async function OwnerRepoPage({ params }: OwnerRepoPageProps) {
  const { owner, repo } = await params

  const cookieStore = await cookies()
  const installDependencies = cookieStore.get('install-dependencies')?.value === 'true'
  const enableBrowser = cookieStore.get('enable-browser')?.value === 'true'

  const session = await getServerSession()

  const stars = await getGitHubStars()

  return (
    <HomePageContent
      initialSelectedOwner={owner}
      initialSelectedRepo={repo}
      initialInstallDependencies={installDependencies}
      initialEnableBrowser={enableBrowser}
      user={session?.user ?? null}
      initialStars={stars}
    />
  )
}
