'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function OnboardingKeyPage() {
  const [mode, setMode] = useState<'choose' | 'byo'>('choose')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [error, setError] = useState('')
  const [hasCompanyKey, setHasCompanyKey] = useState(false)
  const router = useRouter()

  // Check if a company/system key is available
  useEffect(() => {
    fetch('/api/api-keys/check?agent=claude')
      .then((r) => r.json())
      .then((data) => {
        if (data.hasKey) setHasCompanyKey(true)
      })
      .catch(() => {})
  }, [])

  const validate = async () => {
    setStatus('validating')
    setError('')
    try {
      const res = await fetch('/api/keys/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const data = await res.json()
      if (data.valid) {
        setStatus('valid')
        setTimeout(() => router.push('/'), 1000)
      } else {
        setStatus('invalid')
        setError(data.error || 'Key was not accepted')
      }
    } catch {
      setStatus('invalid')
      setError('Network error')
    }
  }

  const useCompanyPlan = () => {
    router.push('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md space-y-6 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">How do you want to use AI?</h1>
          <p className="text-sm text-muted-foreground">
            Choose how to power your AI agents. You can change this anytime in settings.
          </p>
        </div>

        {mode === 'choose' ? (
          <div className="space-y-3">
            {/* Company plan option */}
            {hasCompanyKey && (
              <button
                onClick={useCompanyPlan}
                className="w-full rounded-lg border border-border bg-card p-4 text-left hover:border-primary transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Use company plan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use the shared API key provided by your organization. No setup needed.
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* BYO key option */}
            <button
              onClick={() => setMode('byo')}
              className="w-full rounded-lg border border-border bg-card p-4 text-left hover:border-primary transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-sm">Use my own API key</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste your Anthropic or Gemini key. Your usage, your control. Encrypted and never logged.
                  </p>
                </div>
              </div>
            </button>

            {/* Skip option */}
            <div className="text-center pt-2">
              <button
                onClick={() => router.push('/')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now — I&apos;ll set this up later
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="sk-ant-... or Gemini key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={status === 'validating'}
            />
            <Button className="w-full" onClick={validate} disabled={apiKey.length < 10 || status === 'validating'}>
              {status === 'validating'
                ? 'Validating...'
                : status === 'valid'
                  ? 'Valid! Redirecting...'
                  : 'Validate & Save'}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {status === 'valid' && <p className="text-sm text-green-500">Key validated and saved.</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setMode('choose')}>
                Back
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Get a key at{' '}
              <a href="https://console.anthropic.com" target="_blank" rel="noopener" className="underline">
                console.anthropic.com
              </a>
              {' or '}
              <a href="https://ai.google.dev/gemini-api" target="_blank" rel="noopener" className="underline">
                ai.google.dev
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
