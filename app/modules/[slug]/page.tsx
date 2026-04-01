import { getModuleBySlug } from '@/lib/modules/registry'
import { ModuleOverview } from '@/components/module-overview'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function ModulePage({ params }: PageProps) {
  const { slug } = await params
  const mod = getModuleBySlug(slug)

  if (!mod) {
    notFound()
  }

  return <ModuleOverview module={mod} />
}
