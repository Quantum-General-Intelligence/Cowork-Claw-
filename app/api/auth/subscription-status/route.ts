import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserPlan } from '@/lib/billing/check-subscription'
import { isSuperAdmin, isInternalTeam } from '@/lib/auth/super-admin'

const SUB_COOKIE_MAX_AGE = 60 * 60

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ status: 'unauthenticated' }, { status: 401 })
  }

  if (isSuperAdmin(session.user.email) || isInternalTeam(session.user.email)) {
    const response = NextResponse.json({
      status: 'active',
      planId: isSuperAdmin(session.user.email) ? 'admin' : 'internal',
      planName: isSuperAdmin(session.user.email) ? 'Super Admin' : 'Internal Team',
    })
    response.cookies.set('_sub_status', 'active', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
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
