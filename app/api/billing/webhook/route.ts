import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db/client'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe()
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.userId
        const planId = session.metadata?.planId || 'pro'
        const stripeSubscriptionId = session.subscription as string
        const stripeCustomerId = session.customer as string

        if (userId) {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
          const periodStart = new Date(
            (stripeSub as unknown as { current_period_start: number }).current_period_start * 1000,
          )
          const periodEnd = new Date((stripeSub as unknown as { current_period_end: number }).current_period_end * 1000)

          await db
            .insert(subscriptions)
            .values({
              id: generateId(12),
              userId,
              planId,
              status: 'active',
              stripeCustomerId,
              stripeSubscriptionId,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            })
            .onConflictDoUpdate({
              target: subscriptions.userId,
              set: {
                planId,
                status: 'active',
                stripeCustomerId,
                stripeSubscriptionId,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                updatedAt: new Date(),
              },
            })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object
        await db
          .update(subscriptions)
          .set({
            status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
            currentPeriodStart: new Date(
              (sub as unknown as { current_period_start: number }).current_period_start * 1000,
            ),
            currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await db
          .update(subscriptions)
          .set({ status: 'canceled', planId: 'free', updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
