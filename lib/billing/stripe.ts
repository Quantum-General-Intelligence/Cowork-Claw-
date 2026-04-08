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
    dailyApiCalls: 20,
    monthlySandboxMinutes: 200,
    price: 20,
    priceId: process.env.STRIPE_HOBBY_PRICE_ID ?? null,
    minSeats: 1,
    features: [
      '20 tasks per day',
      '200 sandbox minutes/month',
      'All AI agents',
      'Bring your own key or use ours',
      'Hosted sandbox execution',
    ],
  },
  pro: {
    name: 'Pro',
    dailyApiCalls: 100,
    monthlySandboxMinutes: 1500,
    price: 75,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    minSeats: 1,
    features: [
      '100 tasks per day',
      '1,500 sandbox minutes/month',
      'All AI agents',
      'Bring your own key or use ours',
      'Hosted sandbox execution',
      'Priority support',
      'Orchestration mode',
    ],
  },
  business: {
    name: 'Business',
    dailyApiCalls: 200,
    monthlySandboxMinutes: 3000,
    price: 40,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? null,
    minSeats: 3,
    features: [
      '200 tasks per day per user',
      '3,000 sandbox minutes/month',
      'All AI agents',
      'Bring your own key or use ours',
      'Hosted sandbox execution',
      'Team workspaces',
      'Priority support',
      'Usage analytics',
    ],
  },
} as const

export type PlanId = keyof typeof PLANS
