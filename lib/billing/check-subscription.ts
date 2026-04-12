import { db } from '@/lib/db/client'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { PLANS, type PlanId } from './stripe'

export interface UserPlan {
  planId: PlanId
  name: string
  dailyApiCalls: number
  maxConcurrent: number
  maxTaskMinutes: number
  status: string
  stripeSubscriptionId: string | null
}

const DEFAULT_PLAN: UserPlan = {
  planId: 'hobby',
  name: 'No Plan',
  dailyApiCalls: 0,
  maxConcurrent: 0,
  maxTaskMinutes: 0,
  status: 'inactive',
  stripeSubscriptionId: null,
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  try {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(subscriptions.createdAt)
      .limit(1)

    if (!sub || sub.status === 'canceled') return DEFAULT_PLAN

    const planId = (sub.planId as PlanId) in PLANS ? (sub.planId as PlanId) : 'hobby'
    const plan = PLANS[planId]

    return {
      planId,
      name: plan.name,
      dailyApiCalls: plan.dailyApiCalls,
      maxConcurrent: plan.maxConcurrent,
      maxTaskMinutes: plan.maxTaskMinutes,
      status: sub.status,
      stripeSubscriptionId: sub.stripeSubscriptionId,
    }
  } catch {
    return DEFAULT_PLAN
  }
}
