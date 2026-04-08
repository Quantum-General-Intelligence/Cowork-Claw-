'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    id: 'hobby',
    name: 'Hobby',
    price: 20,
    interval: '/month',
    description: 'For individual developers and side projects',
    features: [
      '20 tasks per day',
      '200 sandbox minutes/month',
      'All AI agents',
      'Bring your own key or use ours',
      'Hosted sandbox execution',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 75,
    interval: '/month',
    description: 'For professional developers shipping daily',
    features: [
      '100 tasks per day',
      '1,500 sandbox minutes/month',
      'All AI agents',
      'Bring your own key or use ours',
      'Hosted sandbox execution',
      'Priority support',
      'Orchestration mode',
    ],
    cta: 'Get Pro',
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 40,
    interval: '/user/month',
    minSeats: 3,
    description: 'For teams that build together (min. 3 users)',
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
    cta: 'Get Business',
    highlighted: false,
  },
]

interface PricingCardsProps {
  currentPlanId?: string
  onSelectPlan?: (planId: string) => void
  loading?: boolean
}

export function PricingCards({ currentPlanId, onSelectPlan, loading }: PricingCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {PLANS.map((plan) => {
        const isCurrent = currentPlanId === plan.id
        return (
          <Card
            key={plan.id}
            className={cn(
              'relative flex flex-col',
              plan.highlighted && 'border-primary shadow-lg shadow-primary/10 scale-[1.02]',
            )}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                Most Popular
              </div>
            )}
            <CardHeader className="pb-4">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <div className="mt-3">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-sm text-muted-foreground ml-1">{plan.interval}</span>
              </div>
              {'minSeats' in plan && typeof plan.minSeats === 'number' && plan.minSeats > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Starts at ${plan.price * plan.minSeats}/month for {plan.minSeats} users
                </p>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={plan.highlighted ? 'default' : 'outline'}
                disabled={isCurrent || loading}
                onClick={() => onSelectPlan?.(plan.id)}
              >
                {isCurrent ? 'Current Plan' : plan.cta}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
