import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
    stripeClient = new Stripe(key, { apiVersion: '2025-03-31.basil' })
  }
  return stripeClient
}

export const PLANS = {
  free: { name: 'Free', dailyApiCalls: 5, monthlySandboxMinutes: 60, priceId: null },
  pro: { name: 'Pro', dailyApiCalls: 50, monthlySandboxMinutes: 600, priceId: process.env.STRIPE_PRO_PRICE_ID },
  enterprise: {
    name: 'Enterprise',
    dailyApiCalls: 500,
    monthlySandboxMinutes: 6000,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
  },
} as const

export type PlanId = keyof typeof PLANS
