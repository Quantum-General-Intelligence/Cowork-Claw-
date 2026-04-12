'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function OnboardingKeyPage() {
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [error, setError] = useState('')
  const router = useRouter()

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md space-y-6 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Connect your Anthropic key</h1>
          <p className="text-muted-foreground text-sm">
            Paste your Anthropic API key to get started. Your key is encrypted and never logged.
          </p>
        </div>
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={status === 'validating'}
          />
          <Button
            className="w-full"
            onClick={validate}
            disabled={apiKey.length < 10 || status === 'validating'}
          >
            {status === 'validating'
              ? 'Validating...'
              : status === 'valid'
                ? 'Valid! Redirecting...'
                : 'Validate & Save'}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {status === 'valid' && <p className="text-sm text-green-500">Key validated and saved.</p>}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Get a key at{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener" className="underline">
            console.anthropic.com
          </a>
        </p>
      </div>
    </div>
  )
}
