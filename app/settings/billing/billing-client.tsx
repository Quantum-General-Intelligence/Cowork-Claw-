'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { PricingCards } from '@/components/pricing-cards'
import { Badge } from '@/components/ui/badge'

interface BillingClientProps {
  planId: string
  planName: string
  dailyLimit: number
  maxConcurrent: number
  maxTaskMinutes: number
  status: string
  hasStripeSubscription: boolean
  todayApiCalls: number
}

export function BillingClient({
  planId,
  planName,
  dailyLimit,
  maxConcurrent,
  maxTaskMinutes,
  status,
  hasStripeSubscription,
  todayApiCalls,
}: BillingClientProps) {
  const [loading, setLoading] = useState(false)
  const isActive = hasStripeSubscription && status === 'active'

  useEffect(() => {
    fetch('/api/auth/subscription-status').catch(() => {})
  }, [])

  async function handleSelectPlan(selectedPlanId: string) {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  async function handleManage() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 bg-background p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Billing & Usage</h1>

      {!isActive ? (
        <div className="space-y-6">
          <div className="border border-yellow-500/50 bg-yellow-500/5 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Choose a plan to get started</h2>
            <p className="text-sm text-muted-foreground">
              Subscribe to a plan to access the AI agent platform. All plans include hosted sandbox execution and
              bring-your-own-key support.
            </p>
          </div>
          <PricingCards onSelectPlan={handleSelectPlan} loading={loading} />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground mb-6">Manage your subscription and view usage statistics.</p>

          <div className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-medium">Current Plan</h2>
                <Badge variant="default">{status}</Badge>
              </div>
              <p className="text-2xl font-bold">{planName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {dailyLimit} tasks/day &middot; {maxConcurrent} concurrent &middot; {maxTaskMinutes} min max/task
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleManage} disabled={loading}>
              Manage Subscription
            </Button>
          </div>

          <div className="border rounded-lg p-4">
            <h2 className="text-sm font-medium mb-3">Usage Today</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="text-2xl font-bold">
                  {todayApiCalls}
                  <span className="text-sm font-normal text-muted-foreground"> / {dailyLimit}</span>
                </p>
                <p className="text-xs text-muted-foreground">Tasks used today</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4">Change plan</h2>
            <PricingCards currentPlanId={planId} onSelectPlan={handleSelectPlan} loading={loading} />
          </div>
        </div>
      )}
    </div>
  )
}
