/**
 * Health endpoint used by external uptime monitors. Returns static booleans —
 * no dynamic values, no IDs, no paths, per AGENTS.md.
 */
import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { getEnv } from '@/lib/env'
import { pingVps } from '@/lib/company/vps-client'
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

async function checkVps(): Promise<boolean> {
  try {
    return await pingVps()
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
  const [db, vps] = await Promise.all([checkDb(), checkVps()])
  const diskFree = checkDiskFree()
  const ok = db && vps && diskFree
  return NextResponse.json({ ok, db, vps, diskFree }, { status: ok ? 200 : 503 })
}
