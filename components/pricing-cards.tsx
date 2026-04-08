'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    id: 'hobby',
    name: 'Hobby',
    price: 0,
    interval: 'forever',
    description: 'For personal projects and experimentation',
    features: ['5 tasks per day', '60 sandbox minutes/month', 'All AI agents', 'Community support'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 20,
    interval: '/month',
    description: 'For professional developers shipping daily',
    features: [
      '50 tasks per day',
      '600 sandbox minutes/month',
      'All AI agents',
      'Priority support',
      'Orchestration mode',
    ],
    cta: 'Upgrade to Pro',
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 40,
    interval: '/user/month',
    description: 'For teams that build together',
    features: [
      '200 tasks per day',
      '3,000 sandbox minutes/month',
      'All AI agents',
      'Team workspaces',
      'Priority support',
      'Usage analytics',
    ],
    cta: 'Upgrade to Business',
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
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
                disabled={isCurrent || loading || plan.id === 'hobby'}
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
