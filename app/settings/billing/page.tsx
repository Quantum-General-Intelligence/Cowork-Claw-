import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getUserPlan } from '@/lib/billing/check-subscription'
import { getUsage } from '@/lib/billing/usage'
import { BillingClient } from './billing-client'

export const metadata: Metadata = {
  title: 'Billing - Cowork-Claw',
}

export default async function BillingPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  const [userPlan, usage] = await Promise.all([getUserPlan(session.user.id), getUsage(session.user.id)])

  return (
    <BillingClient
      planId={userPlan.planId}
      planName={userPlan.name}
      dailyLimit={userPlan.dailyApiCalls}
      monthlyMinutes={userPlan.monthlySandboxMinutes}
      status={userPlan.status}
      hasStripeSubscription={!!userPlan.stripeSubscriptionId}
      todayApiCalls={usage.apiCalls ?? 0}
      todaySandboxMinutes={usage.sandboxMinutes ?? 0}
    />
  )
}
