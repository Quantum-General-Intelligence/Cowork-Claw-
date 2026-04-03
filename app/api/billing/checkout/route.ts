import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getStripe, PLANS, type PlanId } from '@/lib/billing/stripe'
import { db } from '@/lib/db/client'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { planId } = await req.json()
    const plan = PLANS[planId as PlanId]

    if (!plan || !plan.priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const stripe = getStripe()

    // Get or create Stripe customer
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, session.user.id)).limit(1)

    let customerId = sub?.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email || undefined,
        metadata: { userId: session.user.id },
      })
      customerId = customer.id
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/settings/billing?success=true`,
      cancel_url: `${req.nextUrl.origin}/settings/billing?canceled=true`,
      metadata: { userId: session.user.id, planId },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Error creating checkout:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
