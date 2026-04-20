'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type EnvStatus = 'pending' | 'provisioning' | 'ready' | 'error' | 'deprovisioned' | null

interface CliRow {
  cli: string
  installed: boolean
  authenticated: boolean
  authMethod: string | null
}

interface Env {
  id: string
  workspaceId: string
  status: EnvStatus
  linuxUsername: string
  errorMessage: string | null
}

interface EnvResponse {
  environment: Env | null
  clis: CliRow[]
  workspaceId?: string
  reason?: string
}

function OnboardingInner() {
  const router = useRouter()
  const params = useSearchParams()
  const workspaceId = params.get('workspace') || ''
  const [data, setData] = useState<EnvResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/environments/me${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,
      )
      if (!res.ok) throw new Error('Failed to load environment')
      const json = (await res.json()) as EnvResponse
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  // Poll every 3s while provisioning.
  useEffect(() => {
    const status = data?.environment?.status
    if (status === 'ready') return
    const id = window.setInterval(() => load(), 3000)
    return () => window.clearInterval(id)
  }, [data?.environment?.status, load])

  const status = data?.environment?.status
  const ready = status === 'ready'
  const failed = status === 'error'

  const retry = useCallback(async () => {
    if (!workspaceId) return
    await fetch('/api/environments/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    await load()
  }, [workspaceId, load])

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Setting up your environment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We&apos;re creating your Linux account on the company VPS and installing the coding CLIs.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="rounded-lg border p-3 space-y-2">
          <StepRow label="Create invite membership" done />
          <StepRow
            label="Provision Linux account"
            done={Boolean(data?.environment)}
            failed={failed}
            active={!data?.environment && !failed}
          />
          <StepRow
            label="Install & probe CLIs"
            done={ready}
            failed={failed}
            active={Boolean(data?.environment) && !ready && !failed}
          />
          <StepRow label="Ready for tasks" done={ready} active={ready} />
        </div>

        {data?.environment && (
          <div>
            <p className="text-xs text-muted-foreground">Linux user</p>
            <p className="font-mono text-sm">{data.environment.linuxUsername}</p>
          </div>
        )}

        {failed && data?.environment?.errorMessage && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2">
            <p className="text-xs text-red-800 font-mono break-all">{data.environment.errorMessage}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {failed ? (
            <>
              <Button onClick={retry} variant="outline" size="sm">
                Retry provisioning
              </Button>
              <Link href="/" className="text-xs text-muted-foreground underline">
                Skip for now
              </Link>
            </>
          ) : ready ? (
            <Button onClick={() => router.push(`/?workspace=${workspaceId}`)} size="sm">
              Continue to app
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              This usually takes less than a minute. You can also{' '}
              <Link href={`/?workspace=${workspaceId}`} className="underline">
                continue to the app
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OnboardingEnvironmentPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <OnboardingInner />
    </Suspense>
  )
}

function StepRow({
  label,
  done,
  failed,
  active,
}: {
  label: string
  done?: boolean
  failed?: boolean
  active?: boolean
}) {
  const dot = failed ? 'bg-red-500' : done ? 'bg-green-500' : active ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="text-sm">{label}</span>
    </div>
  )
}
