'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface SessionInfo {
  sessionId: string
  status: string
  cli: string
  connectUrl: string
  basicAuthUser: string
  basicAuthToken: string
  expiresAt: string
  errorMessage?: string | null
}

export interface WebTerminalProps {
  environmentId: string
  cli: string
  /** Optional title shown in the header. */
  title?: string
  /** Called once the session is ended (either by close or completion). */
  onClosed?: () => void
}

/**
 * Renders a ttyd terminal hosted on the company VPS inside an iframe.
 *
 * Flow:
 *   1. POST /api/terminal/session to spawn ttyd as the user's Linux account.
 *   2. Load the returned connectUrl (behind HTTP basic auth) in an iframe.
 *   3. DELETE on unmount to kill the ttyd process.
 *
 * The actual HTTP/WS transport is handled by the deployment's reverse proxy
 * (TERMINAL_PROXY_URL env var). See scripts/install-vps-clis.sh for the
 * Caddy/nginx snippet.
 */
export function WebTerminal({ environmentId, cli, title, onClosed }: WebTerminalProps) {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const shutDownRef = useRef(false)

  const shutdown = useCallback(
    async (sessionId: string) => {
      if (shutDownRef.current) return
      shutDownRef.current = true
      try {
        await fetch(`/api/terminal/session/${sessionId}`, { method: 'DELETE' })
      } catch {
        // best-effort
      }
      onClosed?.()
    },
    [onClosed],
  )

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      setStarting(true)
      setError(null)
      try {
        const res = await fetch('/api/terminal/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ environmentId, cli }),
        })
        const json = await res.json()
        if (!res.ok) {
          setError(json?.error || 'Failed to start terminal')
          return
        }
        if (cancelled) {
          await fetch(`/api/terminal/session/${json.sessionId}`, { method: 'DELETE' }).catch(() => {})
          return
        }
        setSession(json as SessionInfo)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start terminal')
      } finally {
        if (!cancelled) setStarting(false)
      }
    }

    void start()
    return () => {
      cancelled = true
      if (session?.sessionId) void shutdown(session.sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentId, cli])

  const iframeSrc = useMemo(() => {
    if (!session) return null
    // Embed basic auth in the URL. Modern browsers accept this for iframes
    // loaded same-origin; for cross-origin the reverse proxy should strip and
    // inject the header instead.
    try {
      const url = new URL(session.connectUrl, window.location.origin)
      url.username = session.basicAuthUser
      url.password = session.basicAuthToken
      return url.toString()
    } catch {
      return session.connectUrl
    }
  }, [session])

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col h-[480px]">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <p className="text-xs font-medium">{title ?? `${cli} login`}</p>
        <Button size="sm" variant="ghost" onClick={() => session?.sessionId && shutdown(session.sessionId)}>
          Close
        </Button>
      </div>
      <div className="flex-1 relative bg-black">
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            Starting terminal…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <p className="text-sm text-red-400 text-center">{error}</p>
          </div>
        )}
        {iframeSrc && !error && (
          <iframe
            src={iframeSrc}
            title={title ?? `${cli} terminal`}
            className="w-full h-full border-0"
            // sandbox tight enough to keep ttyd isolated but loose enough for WS.
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>
    </div>
  )
}
