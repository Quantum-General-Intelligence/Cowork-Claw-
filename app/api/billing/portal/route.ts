import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getStripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db/client'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, session.user.id)).limit(1)

    if (!sub?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
    }

    const stripe = getStripe()
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${req.nextUrl.origin}/settings/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('Error creating portal session:', error)
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 })
  }
}
