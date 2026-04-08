import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserPlan } from '@/lib/billing/check-subscription'

const SUB_COOKIE_MAX_AGE = 60 * 60 // 1 hour

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ status: 'unauthenticated' }, { status: 401 })
  }

  const plan = await getUserPlan(session.user.id)
  const isActive = !!plan.stripeSubscriptionId && plan.status === 'active'

  const response = NextResponse.json({
    status: isActive ? 'active' : 'inactive',
    planId: plan.planId,
    planName: plan.name,
  })

  response.cookies.set('_sub_status', isActive ? 'active' : 'inactive', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SUB_COOKIE_MAX_AGE,
  })

  return response
}
