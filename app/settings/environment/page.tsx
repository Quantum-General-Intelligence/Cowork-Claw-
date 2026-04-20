'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { WebTerminal } from '@/components/terminal/web-terminal'

type EnvStatus = 'pending' | 'provisioning' | 'ready' | 'error' | 'deprovisioned' | null

interface Environment {
  id: string
  workspaceId: string
  linuxUsername: string
  homeDir: string
  status: EnvStatus
  errorMessage: string | null
  provisionedAt: string | null
  lastActiveAt: string | null
}

interface CliRow {
  cli: string
  installed: boolean
  authenticated: boolean
  authMethod: string | null
  lastCheckedAt: string | null
}

interface EnvResponse {
  environment: Environment | null
  clis: CliRow[]
  workspaceId?: string
  reason?: string
}

export default function EnvironmentPage() {
  const [data, setData] = useState<EnvResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loginFor, setLoginFor] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/environments/me${refresh ? '?refresh=1' : ''}`)
      if (!res.ok) throw new Error('Failed to load environment')
      const json = (await res.json()) as EnvResponse
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environment')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Poll while provisioning
  useEffect(() => {
    const status = data?.environment?.status
    if (status !== 'pending' && status !== 'provisioning') return
    const id = window.setInterval(() => load(), 5000)
    return () => window.clearInterval(id)
  }, [data?.environment?.status, load])

  const resyncGithub = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          scopes: 'repo read:user user:email',
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/settings/environment')}`,
        },
      })
      if (authError) {
        setError(authError.message || 'Failed to re-sync GitHub')
        return
      }
      if (data?.url) window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-sync GitHub')
    }
  }, [])

  const provision = useCallback(async () => {
    if (!data?.workspaceId && !data?.environment?.workspaceId) return
    const workspaceId = data?.environment?.workspaceId ?? data?.workspaceId
    setBusy('provision')
    try {
      const res = await fetch('/api/environments/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) throw new Error('Failed to queue provisioning')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision')
    } finally {
      setBusy(null)
    }
  }, [data, load])

  if (loading && !data) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm text-muted-foreground">Loading environment…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <Button onClick={() => load()} variant="outline" size="sm">
          Retry
        </Button>
      </div>
    )
  }

  if (data?.reason === 'no_workspace') {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-2">
        <h1 className="text-2xl font-bold">Your environment</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re not in any workspace yet. Accept an invite or create one to get started.
        </p>
      </div>
    )
  }

  const env = data?.environment ?? null

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your environment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your persistent Linux account on the company VPS. Tasks run here; CLI logins survive across sessions.
        </p>
      </div>

      {!env && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm">No environment yet.</p>
          <Button onClick={provision} disabled={busy === 'provision'} size="sm">
            {busy === 'provision' ? 'Queuing…' : 'Provision my environment'}
          </Button>
        </div>
      )}

      {env && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Linux user</p>
              <p className="font-mono text-sm">{env.linuxUsername}</p>
            </div>
            <StatusBadge status={env.status} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Home directory</p>
            <p className="font-mono text-sm">{env.homeDir}</p>
          </div>
          {env.errorMessage && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2">
              <p className="text-xs text-red-800 font-mono break-all">{env.errorMessage}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => load(true)} variant="outline" size="sm" disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh CLI status'}
            </Button>
            <Button onClick={resyncGithub} variant="outline" size="sm">
              Re-sync GitHub access
            </Button>
            {(env.status === 'error' || env.status === 'deprovisioned') && (
              <Button onClick={provision} variant="outline" size="sm" disabled={busy === 'provision'}>
                {busy === 'provision' ? 'Queuing…' : 'Re-provision'}
              </Button>
            )}
          </div>
        </div>
      )}

      {env && env.status === 'ready' && loginFor && (
        <div className="space-y-2">
          <WebTerminal
            environmentId={env.id}
            cli={loginFor}
            title={`${loginFor} login`}
            onClosed={() => {
              setLoginFor(null)
              void load(true)
            }}
          />
        </div>
      )}

      {env && env.status === 'ready' && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Installed CLIs</h2>
          <div className="rounded-lg border divide-y">
            {(data?.clis ?? []).map((cli) => (
              <div key={cli.cli} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{cli.cli}</p>
                  <p className="text-xs text-muted-foreground">
                    {cli.installed ? 'Installed' : 'Not installed'}
                    {cli.authenticated ? ` · authenticated (${cli.authMethod ?? 'unknown'})` : ' · not authenticated'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {cli.installed && !cli.authenticated && (
                    <Button size="sm" variant="outline" onClick={() => setLoginFor(cli.cli)}>
                      Log in…
                    </Button>
                  )}
                  <CliBadge installed={cli.installed} authenticated={cli.authenticated} />
                </div>
              </div>
            ))}
            {(data?.clis ?? []).length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No CLIs tracked yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: EnvStatus }) {
  const label = status ?? 'unknown'
  const colour =
    status === 'ready'
      ? 'bg-green-100 text-green-800 border-green-200'
      : status === 'error'
        ? 'bg-red-100 text-red-800 border-red-200'
        : status === 'deprovisioned'
          ? 'bg-gray-100 text-gray-700 border-gray-200'
          : 'bg-yellow-100 text-yellow-800 border-yellow-200'
  return <span className={`text-xs rounded-full px-2 py-0.5 border ${colour}`}>{label}</span>
}

function CliBadge({ installed, authenticated }: { installed: boolean; authenticated: boolean }) {
  if (!installed)
    return <span className="text-xs rounded-full border px-2 py-0.5 bg-gray-50 text-gray-600">not installed</span>
  if (authenticated)
    return (
      <span className="text-xs rounded-full border px-2 py-0.5 bg-green-50 text-green-700 border-green-200">ready</span>
    )
  return (
    <span className="text-xs rounded-full border px-2 py-0.5 bg-yellow-50 text-yellow-700 border-yellow-200">
      needs login
    </span>
  )
}
