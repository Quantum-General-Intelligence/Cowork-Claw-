import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { getModuleBySlug } from '@/lib/modules/registry'
import { ModuleLayout } from '@/components/module-layout'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'

interface LayoutProps {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

export default async function Layout({ params, children }: LayoutProps) {
  const { slug } = await params
  const mod = getModuleBySlug(slug)

  if (!mod) {
    notFound()
  }

  const session = await getServerSession()
  const stars = await getGitHubStars()

  return (
    <ModuleLayout
      module={mod}
      user={session?.user ?? null}
      authProvider={session?.authProvider ?? null}
      initialStars={stars}
    >
      {children}
    </ModuleLayout>
  )
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params
  const mod = getModuleBySlug(slug)

  if (!mod) {
    return { title: 'Module Not Found' }
  }

  return {
    title: `${mod.name} - Coding Agent Platform`,
    description: mod.description,
  }
}
