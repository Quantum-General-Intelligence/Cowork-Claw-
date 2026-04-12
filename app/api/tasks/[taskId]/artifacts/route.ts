import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { taskArtifacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createHmac } from 'crypto'

const HMAC_KEY = process.env.ENCRYPTION_KEY || 'dev-key'

function signUrl(id: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const sig = createHmac('sha256', HMAC_KEY).update(`${id}|${exp}`).digest('hex')
  return `/api/artifacts/${id}?sig=${sig}&exp=${exp}`
}

interface RouteParams {
  params: Promise<{
    taskId: string
  }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { taskId } = await params
  try {
    const artifacts = await db.select().from(taskArtifacts).where(eq(taskArtifacts.taskId, taskId))

    const withUrls = artifacts.map((a) => ({
      id: a.id,
      filename: a.filename,
      mime: a.mime,
      size: a.size,
      downloadUrl: signUrl(a.id),
    }))

    return NextResponse.json({ artifacts: withUrls })
  } catch {
    return NextResponse.json({ artifacts: [] })
  }
}
