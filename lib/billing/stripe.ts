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
    maxConcurrent: 1,
    maxTaskMinutes: 30,
    price: 19,
    priceId: process.env.STRIPE_HOBBY_PRICE_ID ?? null,
    minSeats: 1,
    features: [
      '5 tasks per day',
      'BYO Anthropic key',
      '30 min max per task',
      '1 concurrent task',
      'All 10 cowork templates',
    ],
  },
  pro: {
    name: 'Pro',
    dailyApiCalls: 50,
    maxConcurrent: 2,
    maxTaskMinutes: 120,
    price: 49,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    minSeats: 1,
    features: [
      '50 tasks per day',
      'BYO Anthropic key',
      '2 hour max per task',
      '2 concurrent tasks',
      'All 10 cowork templates',
      'Priority queue',
    ],
  },
  studio: {
    name: 'Studio',
    dailyApiCalls: 100,
    maxConcurrent: 3,
    maxTaskMinutes: 180,
    price: 129,
    priceId: process.env.STRIPE_STUDIO_PRICE_ID ?? null,
    minSeats: 3,
    features: [
      '100 tasks per day',
      'BYO Anthropic key',
      '3 hour max per task',
      '3 concurrent tasks',
      '3 team seats',
      'Shared task feed',
      'Team templates',
    ],
  },
  whitelabel: {
    name: 'White-Label',
    dailyApiCalls: 500,
    maxConcurrent: 5,
    maxTaskMinutes: 180,
    price: 399,
    priceId: process.env.STRIPE_WHITELABEL_PRICE_ID ?? null,
    minSeats: 1,
    features: [
      'Unlimited seats',
      'BYO Anthropic key',
      '3 hour max per task',
      '5 concurrent tasks',
      'Custom branding',
      'Custom domain',
      'All templates',
      'Priority support',
    ],
  },
} as const

export type PlanId = keyof typeof PLANS
