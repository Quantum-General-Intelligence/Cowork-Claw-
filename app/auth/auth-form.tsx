'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getEnabledAuthProviders } from '@/lib/auth/providers'

type Mode = 'signin' | 'signup'

export function AuthForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createClient()
  const enabled = getEnabledAuthProviders()
  const hasOAuth = enabled.google || enabled.github

  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
      : '/auth/callback'

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email for the confirmation link.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        window.location.href = next || '/'
      }
    }

    setLoading(false)
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        ...(provider === 'github' ? { scopes: 'repo,read:user,user:email' } : {}),
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Cowork-Claw</h1>
        <p className="mt-2 text-muted-foreground">
          {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
        </p>
      </div>

      {hasOAuth && (
        <div className="space-y-3">
          {enabled.google && (
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-card-foreground shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          )}

          {enabled.github && (
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-card-foreground shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          )}
        </div>
      )}

      {hasOAuth && enabled.email && (
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
          </div>
        </div>
      )}

      {enabled.email && (
        <>
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm text-primary">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                    setMessage(null)
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin')
                    setError(null)
                    setMessage(null)
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </>
      )}

      {!enabled.email && error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
