'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PricingCards } from '@/components/pricing-cards'
import { Badge } from '@/components/ui/badge'

interface BillingClientProps {
  planId: string
  planName: string
  dailyLimit: number
  monthlyMinutes: number
  status: string
  hasStripeSubscription: boolean
  todayApiCalls: number
  todaySandboxMinutes: number
}

export function BillingClient({
  planId,
  planName,
  dailyLimit,
  monthlyMinutes,
  status,
  hasStripeSubscription,
  todayApiCalls,
  todaySandboxMinutes,
}: BillingClientProps) {
  const [loading, setLoading] = useState(false)

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
      <p className="text-sm text-muted-foreground mb-6">Manage your subscription and view usage statistics.</p>

      <div className="space-y-6">
        <div className="border rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-medium">Current Plan</h2>
              <Badge variant={status === 'active' ? 'default' : 'destructive'}>{status}</Badge>
            </div>
            <p className="text-2xl font-bold">{planName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {dailyLimit} tasks/day &middot; {monthlyMinutes.toLocaleString()} sandbox minutes/month
            </p>
          </div>
          {hasStripeSubscription && (
            <Button variant="outline" size="sm" onClick={handleManage} disabled={loading}>
              Manage Subscription
            </Button>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-3">Usage Today</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold">
                {todayApiCalls}
                <span className="text-sm font-normal text-muted-foreground"> / {dailyLimit}</span>
              </p>
              <p className="text-xs text-muted-foreground">Tasks used</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {todaySandboxMinutes}
                <span className="text-sm font-normal text-muted-foreground"> min</span>
              </p>
              <p className="text-xs text-muted-foreground">Sandbox time</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Upgrade your plan</h2>
          <PricingCards currentPlanId={planId} onSelectPlan={handleSelectPlan} loading={loading} />
        </div>
      </div>
    </div>
  )
}
