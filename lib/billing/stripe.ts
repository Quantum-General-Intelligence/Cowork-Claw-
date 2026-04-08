import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_THEOSYM_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
    stripeClient = new Stripe(key, { apiVersion: '2025-03-31.basil' })
  }
  return stripeClient
}

export const PLANS = {
  hobby: {
    name: 'Hobby',
    dailyApiCalls: 5,
    monthlySandboxMinutes: 60,
    price: 0,
    priceId: null,
    features: ['5 tasks per day', '60 sandbox minutes/month', 'Community support'],
  },
  pro: {
    name: 'Pro',
    dailyApiCalls: 50,
    monthlySandboxMinutes: 600,
    price: 20,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    features: ['50 tasks per day', '600 sandbox minutes/month', 'All AI agents', 'Priority support'],
  },
  business: {
    name: 'Business',
    dailyApiCalls: 200,
    monthlySandboxMinutes: 3000,
    price: 40,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? null,
    features: [
      '200 tasks per day',
      '3,000 sandbox minutes/month',
      'All AI agents',
      'Team workspaces',
      'Priority support',
    ],
  },
} as const

export type PlanId = keyof typeof PLANS
