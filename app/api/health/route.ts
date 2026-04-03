import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {}

  // Check database connectivity
  try {
    await db
      .select({ count: sql`1` })
      .from(users)
      .limit(1)
    checks.database = { status: 'ok' }
  } catch (error) {
    checks.database = { status: 'error', message: error instanceof Error ? error.message : 'DB unreachable' }
  }

  // Check sandbox provider configuration
  const provider = process.env.SANDBOX_PROVIDER || (process.env.SANDBOX_SSH_HOST ? 'docker' : 'vercel')
  if (provider === 'docker') {
    checks.sandbox = process.env.SANDBOX_SSH_HOST
      ? { status: 'ok', message: `Docker @ ${process.env.SANDBOX_SSH_HOST}` }
      : { status: 'error', message: 'SANDBOX_SSH_HOST not set' }
  } else {
    checks.sandbox =
      process.env.SANDBOX_VERCEL_TOKEN && process.env.SANDBOX_VERCEL_TEAM_ID
        ? { status: 'ok', message: 'Vercel Sandbox' }
        : { status: 'error', message: 'Vercel sandbox credentials missing' }
  }

  // Check API keys
  const hasAnthropicKey = !!(process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY)
  checks.apiKeys = hasAnthropicKey
    ? { status: 'ok' }
    : { status: 'warning', message: 'No AI API keys configured — users must provide their own' }

  // Check auth
  const hasAuth = !!(process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_VERCEL_CLIENT_ID)
  checks.auth = hasAuth ? { status: 'ok' } : { status: 'error', message: 'No OAuth provider configured' }

  const hasErrors = Object.values(checks).some((c) => c.status === 'error')
  const hasWarnings = Object.values(checks).some((c) => c.status === 'warning')

  return NextResponse.json({
    status: hasErrors ? 'error' : hasWarnings ? 'degraded' : 'ok',
    checks,
    timestamp: new Date().toISOString(),
  })
}
