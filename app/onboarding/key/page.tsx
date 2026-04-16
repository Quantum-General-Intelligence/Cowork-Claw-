'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Mode = 'choose' | 'byo' | 'subscription'
type SubscriptionProvider = 'claude' | 'gemini' | null
type StepStatus = 'idle' | 'validating' | 'valid' | 'invalid'

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors shrink-0"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}

function CheckCircle() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 mx-auto">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
      {n}
    </span>
  )
}

export default function OnboardingKeyPage() {
  const [mode, setMode] = useState<Mode>('choose')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState('')
  const [hasCompanyKey, setHasCompanyKey] = useState(false)
  const [subProvider, setSubProvider] = useState<SubscriptionProvider>(null)
  const [credentials, setCredentials] = useState('')
  const [authProvider, setAuthProvider] = useState<string | null>(null)
  const [subscriptionType, setSubscriptionType] = useState<string | null>(null)
  const [isMac, setIsMac] = useState(true)
  const router = useRouter()

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'))
  }, [])

  useEffect(() => {
    fetch('/api/api-keys/check?agent=claude')
      .then((r) => r.json())
      .then((data) => { if (data.hasKey) setHasCompanyKey(true) })
      .catch(() => {})
    // Get current auth provider from session info
    fetch('/api/auth/info')
      .then((r) => r.json())
      .then((data) => { if (data.provider) setAuthProvider(data.provider) })
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
        setTimeout(() => router.push('/'), 1500)
      } else {
        setStatus('invalid')
        setError(data.error || 'Key was not accepted')
      }
    } catch {
      setStatus('invalid')
      setError('Network error')
    }
  }

  const connectClaudeSubscription = useCallback(async () => {
    setStatus('validating')
    setError('')
    try {
      const res = await fetch('/api/auth/claude-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'submit-credentials', credentials }),
      })
      const data = await res.json()
      if (data.success) {
        setSubscriptionType(data.subscriptionType)
        setStatus('valid')
      } else {
        setStatus('invalid')
        setError(data.error || 'Could not connect subscription')
      }
    } catch {
      setStatus('invalid')
      setError('Network error')
    }
  }, [credentials])

  const connectGeminiSubscription = useCallback(async () => {
    setStatus('validating')
    setError('')
    try {
      const res = await fetch('/api/keys/connect-subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'gemini-subscription', credentials }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('valid')
        setTimeout(() => router.push('/'), 1500)
      } else {
        setStatus('invalid')
        setError(data.error || 'Could not connect Gemini subscription')
      }
    } catch {
      setStatus('invalid')
      setError('Network error')
    }
  }, [credentials])

  const resetSubscriptionFlow = () => {
    setSubProvider(null)
    setCredentials('')
    setStatus('idle')
    setError('')
    setSubscriptionType(null)
  }

  const macCopyCommand = 'claude login && cat ~/.claude/.credentials.json | pbcopy'
  const linuxCopyCommand = 'claude login && cat ~/.claude/.credentials.json | xclip -selection clipboard'
  const copyCommand = isMac ? macCopyCommand : linuxCopyCommand

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md space-y-6 p-6">

        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">
            {mode === 'choose' && 'How do you want to use AI?'}
            {mode === 'byo' && 'Enter your API key'}
            {mode === 'subscription' && !subProvider && 'Which subscription?'}
            {mode === 'subscription' && subProvider === 'claude' && 'Connect Claude Max / Pro'}
            {mode === 'subscription' && subProvider === 'gemini' && 'Connect Gemini Ultra'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'choose' && 'Choose how to power your AI agents. You can change this anytime in settings.'}
            {mode === 'byo' && 'Your key is encrypted and never logged.'}
            {mode === 'subscription' && !subProvider && 'Select your active subscription.'}
            {mode === 'subscription' && subProvider === 'claude' && 'One-time setup — we store your credentials securely.'}
            {mode === 'subscription' && subProvider === 'gemini' && 'Connect your Google AI access.'}
          </p>
        </div>

        {/* ─── CHOOSE ─── */}
        {mode === 'choose' && (
          <div className="space-y-3">
            {hasCompanyKey && (
              <button
                onClick={() => router.push('/')}
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

            <button
              onClick={() => setMode('subscription')}
              className="w-full rounded-lg border border-border bg-card p-4 text-left hover:border-primary transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 7h-9" /><path d="M14 17H5" />
                    <circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-sm">Connect your subscription</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use your Claude Max/Pro or Gemini Ultra subscription. No API key needed.
                  </p>
                </div>
              </div>
            </button>

            <div className="text-center pt-2">
              <button
                onClick={() => router.push('/')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now — I&apos;ll set this up later
              </button>
            </div>
          </div>
        )}

        {/* ─── BYO KEY ─── */}
        {mode === 'byo' && (
          <div className="space-y-4">
            {status === 'valid' ? (
              <div className="space-y-4 text-center">
                <CheckCircle />
                <p className="text-sm font-medium text-green-500">Key validated and saved!</p>
                <p className="text-xs text-muted-foreground">Redirecting you to the app…</p>
              </div>
            ) : (
              <>
                <Input
                  type="password"
                  placeholder="sk-ant-... or Gemini key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={status === 'validating'}
                />
                <Button
                  className="w-full"
                  onClick={validate}
                  disabled={apiKey.length < 10 || status === 'validating'}
                >
                  {status === 'validating' ? 'Validating…' : 'Validate & Save'}
                </Button>
                {error && <p className="text-sm text-red-500">{error}</p>}
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
                <Button variant="outline" size="sm" className="w-full" onClick={() => setMode('choose')}>
                  Back
                </Button>
              </>
            )}
          </div>
        )}

        {/* ─── SUBSCRIPTION: choose provider ─── */}
        {mode === 'subscription' && !subProvider && (
          <div className="space-y-3">
            <button
              onClick={() => setSubProvider('claude')}
              className="w-full rounded-lg border border-border bg-card p-4 text-left hover:border-primary transition-colors"
            >
              <p className="font-medium text-sm">Claude Max or Pro</p>
              <p className="text-xs text-muted-foreground mt-0.5">Anthropic subscription via claude.ai</p>
            </button>
            <button
              onClick={() => setSubProvider('gemini')}
              className="w-full rounded-lg border border-border bg-card p-4 text-left hover:border-primary transition-colors"
            >
              <p className="font-medium text-sm">Gemini Ultra</p>
              <p className="text-xs text-muted-foreground mt-0.5">Google One AI Premium subscription</p>
            </button>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setMode('choose')}>
              Back
            </Button>
          </div>
        )}

        {/* ─── SUBSCRIPTION: Claude ─── */}
        {mode === 'subscription' && subProvider === 'claude' && (
          <div className="space-y-4">
            {status === 'valid' ? (
              <div className="space-y-4 text-center">
                <CheckCircle />
                <div>
                  <p className="text-sm font-medium text-green-500">Claude subscription connected!</p>
                  {subscriptionType && subscriptionType !== 'unknown' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Plan: <span className="font-medium text-foreground capitalize">{subscriptionType}</span>
                    </p>
                  )}
                </div>
                <Button className="w-full" onClick={() => router.push('/')}>
                  Continue to app
                </Button>
              </div>
            ) : (
              <>
                {/* Step 1 */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <StepBadge n={1} />
                    <p className="text-sm font-medium">Run this command in your terminal</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                    <code className="flex-1 text-xs font-mono text-foreground break-all">{copyCommand}</code>
                    <CopyButton text={copyCommand} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This logs you in to Claude and copies your credentials to the clipboard.
                    {!isMac && ' On Linux, install xclip first: sudo apt install xclip'}
                  </p>
                  {!isMac && (
                    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 mt-1">
                      <code className="flex-1 text-xs font-mono text-foreground break-all">{macCopyCommand}</code>
                      <CopyButton text={macCopyCommand} label="macOS" />
                    </div>
                  )}
                </div>

                {/* Step 2 */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <StepBadge n={2} />
                    <p className="text-sm font-medium">Paste the result here</p>
                  </div>
                  <textarea
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none"
                    placeholder={'{\n  "claudeAiOauth": {\n    "accessToken": "sk-ant-oat01-…",\n    …\n  }\n}'}
                    value={credentials}
                    onChange={(e) => setCredentials(e.target.value)}
                    disabled={status === 'validating'}
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <Button
                  className="w-full"
                  onClick={connectClaudeSubscription}
                  disabled={credentials.length < 10 || status === 'validating'}
                >
                  {status === 'validating' ? 'Connecting…' : 'Connect Claude Subscription'}
                </Button>

                <Button variant="outline" size="sm" className="w-full" onClick={resetSubscriptionFlow}>
                  Back
                </Button>
              </>
            )}
          </div>
        )}

        {/* ─── SUBSCRIPTION: Gemini ─── */}
        {mode === 'subscription' && subProvider === 'gemini' && (
          <div className="space-y-4">
            {status === 'valid' ? (
              <div className="space-y-4 text-center">
                <CheckCircle />
                <p className="text-sm font-medium text-green-500">Gemini access connected!</p>
                <Button className="w-full" onClick={() => router.push('/')}>
                  Continue to app
                </Button>
              </div>
            ) : authProvider === 'google' ? (
              /* User signed in with Google — they're already connected */
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-start gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 mt-0.5 shrink-0">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium">You&apos;re already connected via Google!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your Gemini access is ready to use. No extra setup needed.
                    </p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => router.push('/')}>
                  Continue to app
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={resetSubscriptionFlow}>
                  Back
                </Button>
              </div>
            ) : (
              /* GitHub / email sign-in — ask for API key */
              <>
                <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                  <p className="text-sm font-medium">Paste your Google API key</p>
                  <p className="text-xs text-muted-foreground">
                    Get one at{' '}
                    <a
                      href="https://ai.google.dev/gemini-api/docs/api-key"
                      target="_blank"
                      rel="noopener"
                      className="underline text-primary"
                    >
                      ai.google.dev/gemini-api/docs/api-key
                    </a>
                  </p>
                </div>

                <Input
                  type="password"
                  placeholder="AIza..."
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                  disabled={status === 'validating'}
                />

                {error && <p className="text-sm text-red-500">{error}</p>}

                <Button
                  className="w-full"
                  onClick={connectGeminiSubscription}
                  disabled={credentials.length < 10 || status === 'validating'}
                >
                  {status === 'validating' ? 'Connecting…' : 'Connect Gemini'}
                </Button>

                <Button variant="outline" size="sm" className="w-full" onClick={resetSubscriptionFlow}>
                  Back
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
