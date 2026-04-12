/**
 * Health endpoint used by the external uptime monitor and by the /api/health
 * line in the preflight checklist. Returns static booleans — no dynamic values,
 * no IDs, no paths, per AGENTS.md.
 */
import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import { countCoworkSandboxes } from '@/lib/sandbox/concurrency'
import { statfsSync } from 'fs'

export const dynamic = 'force-dynamic'

async function checkDb(): Promise<boolean> {
  try {
    const env = getEnv()
    const sql = postgres(env.POSTGRES_URL, { max: 1, connect_timeout: 2 })
    try {
      await sql`SELECT 1`
      return true
    } finally {
      await sql.end({ timeout: 1 })
    }
  } catch {
    return false
  }
}

async function checkSshToDocker(): Promise<boolean> {
  try {
    const env = getEnv()
    const keyPem = Buffer.from(env.SANDBOX_SSH_KEY, 'base64').toString('utf-8')
    await countCoworkSandboxes({
      host: env.SANDBOX_SSH_HOST,
      port: env.SANDBOX_SSH_PORT,
      username: env.SANDBOX_SSH_USER,
      privateKey: keyPem,
    })
    return true
  } catch {
    return false
  }
}

function checkDiskFree(): boolean {
  try {
    const env = getEnv()
    const stats = statfsSync(env.ARTIFACT_ROOT)
    const freeBytes = Number(stats.bavail) * Number(stats.bsize)
    return freeBytes > 2 * 1024 * 1024 * 1024
  } catch {
    return false
  }
}

export async function GET() {
  const [db, sshToDocker] = await Promise.all([checkDb(), checkSshToDocker()])
  const diskFree = checkDiskFree()
  const ok = db && sshToDocker && diskFree
  return NextResponse.json({ ok, db, sshToDocker, diskFree }, { status: ok ? 200 : 503 })
}
