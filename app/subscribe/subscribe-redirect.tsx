'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

export function SubscribeRedirect({ planId }: { planId: string }) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function startCheckout() {
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        })
        const data = await res.json()
        if (data.url) {
          window.location.href = data.url
        } else {
          setError('Failed to create checkout session')
        }
      } catch {
        setError('Something went wrong. Please try again.')
      }
    }
    startCheckout()
  }, [planId])

  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <a href="/settings/billing" className="text-sm text-primary underline">
            Go to billing
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Redirecting to checkout...</p>
      </div>
    </div>
  )
}
