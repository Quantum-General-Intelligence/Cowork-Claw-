'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface Connection {
  provider: string
  connected: boolean
  details?: string
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/api-keys/check?agent=claude').then(r => r.json()),
      fetch('/api/api-keys/check?agent=gemini').then(r => r.json()),
    ]).then(([claude, gemini]) => {
      setConnections([
        {
          provider: 'Claude (API Key)',
          connected: claude.hasKey,
          details: claude.hasKey ? 'API key configured' : undefined,
        },
        {
          provider: 'Gemini (API Key)',
          connected: gemini.hasKey,
          details: gemini.hasKey ? 'API key configured' : undefined,
        },
      ])
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connected Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your AI provider connections
        </p>
      </div>
      <div className="space-y-3">
        {connections.map((c) => (
          <div key={c.provider} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">{c.provider}</p>
              {c.details && <p className="text-xs text-muted-foreground">{c.details}</p>}
            </div>
            <div className="flex items-center gap-2">
              {c.connected ? (
                <span className="text-xs text-green-500 font-medium">Connected</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { window.location.href = '/onboarding/key' }}
                >
                  Connect
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        onClick={() => { window.location.href = '/onboarding/key' }}
      >
        Add new connection
      </Button>
    </div>
  )
}
