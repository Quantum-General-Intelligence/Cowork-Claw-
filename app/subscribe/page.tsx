import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import { PLANS, type PlanId } from '@/lib/billing/stripe'
import { SubscribeRedirect } from './subscribe-redirect'

interface Props {
  searchParams: Promise<{ plan?: string }>
}

export default async function SubscribePage({ searchParams }: Props) {
  const session = await getServerSession()
  const params = await searchParams

  if (!session?.user) {
    redirect(`/auth?next=/subscribe?plan=${params.plan || 'hobby'}`)
  }

  const planId = (params.plan as PlanId) || 'hobby'
  if (!(planId in PLANS)) {
    redirect('/settings/billing')
  }

  return <SubscribeRedirect planId={planId} />
}
