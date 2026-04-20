'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Workspace {
  id: string
  name: string
  role: string
  usePersistentEnv: boolean
}

interface MemberEnvironment {
  id: string
  linuxUsername: string
  homeDir: string
  status: string | null
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

interface Member {
  userId: string
  username: string | null
  email: string | null
  name: string | null
  role: string
  environment: MemberEnvironment | null
  clis: CliRow[]
}

export default function CompanyPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/workspaces')
        if (!res.ok) throw new Error('Failed to load workspaces')
        const json = await res.json()
        const ws: Workspace[] = (json.workspaces ?? []).filter((w: Workspace) => ['owner', 'admin'].includes(w.role))
        setWorkspaces(ws)
        if (ws.length > 0) setWorkspaceId(ws[0].id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const loadMembers = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/environments`)
      if (!res.ok) throw new Error('Failed to load members')
      const json = await res.json()
      setMembers(json.members ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const runAction = useCallback(
    async (userId: string, action: string, cli?: string) => {
      if (!workspaceId) return
      setBusyUserId(userId)
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/environments/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, cli }),
        })
        if (!res.ok) throw new Error('Action failed')
        await loadMembers()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      } finally {
        setBusyUserId(null)
      }
    },
    [workspaceId, loadMembers],
  )

  const selected = useMemo(() => workspaces.find((w) => w.id === workspaceId) ?? null, [workspaces, workspaceId])

  if (!loading && workspaces.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-2">
        <h1 className="text-2xl font-bold">Company administration</h1>
        <p className="text-sm text-muted-foreground">You don&apos;t have owner or admin access in any workspace.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Company administration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage member environments on the company VPS: provision, deprovision, re-probe CLIs, reset auth state.
          </p>
        </div>
        {workspaces.length > 1 && (
          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={workspaceId ?? ''}
            onChange={(e) => setWorkspaceId(e.target.value || null)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected && !selected.usePersistentEnv && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-xs text-yellow-900">
            Persistent environments are disabled for this workspace. Enable{' '}
            <span className="font-mono">use_persistent_env</span> on the workspace to route tasks through the VPS.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3 font-medium">Member</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Linux user</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">CLIs</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => {
              const busy = busyUserId === m.userId
              return (
                <tr key={m.userId} className="align-top">
                  <td className="p-3">
                    <div className="font-medium">{m.name || m.username || m.email || m.userId}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{m.role}</td>
                  <td className="p-3">
                    {m.environment ? (
                      <span className="font-mono text-xs">{m.environment.linuxUsername}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={m.environment?.status ?? null} />
                      {m.environment?.errorMessage && (
                        <span
                          className="text-xs text-red-700 font-mono max-w-[16rem] truncate"
                          title={m.environment.errorMessage}
                        >
                          {m.environment.errorMessage}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(m.clis ?? []).map((c) => (
                        <CliPill key={c.cli} cli={c} />
                      ))}
                      {(m.clis ?? []).length === 0 && <span className="text-xs text-muted-foreground">none</span>}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {!m.environment && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => runAction(m.userId, 'provision')}
                        >
                          Provision
                        </Button>
                      )}
                      {m.environment && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => runAction(m.userId, 'refresh')}
                          >
                            Refresh
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => runAction(m.userId, 'reprovision')}
                          >
                            Re-provision
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => runAction(m.userId, 'deprovision')}
                          >
                            Deprovision
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading && <div className="p-3 text-xs text-muted-foreground">Loading…</div>}
        {!loading && members.length === 0 && <div className="p-3 text-xs text-muted-foreground">No members.</div>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? 'none'
  const colour =
    status === 'ready'
      ? 'bg-green-100 text-green-800 border-green-200'
      : status === 'error'
        ? 'bg-red-100 text-red-800 border-red-200'
        : status === 'deprovisioned'
          ? 'bg-gray-100 text-gray-700 border-gray-200'
          : status === 'pending' || status === 'provisioning'
            ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
            : 'bg-gray-100 text-gray-600 border-gray-200'
  return <span className={`text-xs rounded-full px-2 py-0.5 border inline-block ${colour}`}>{label}</span>
}

function CliPill({ cli }: { cli: CliRow }) {
  const tone = !cli.installed
    ? 'bg-gray-100 text-gray-600'
    : cli.authenticated
      ? 'bg-green-100 text-green-800'
      : 'bg-yellow-100 text-yellow-800'
  return <span className={`text-xs rounded-full px-2 py-0.5 ${tone}`}>{cli.cli}</span>
}
