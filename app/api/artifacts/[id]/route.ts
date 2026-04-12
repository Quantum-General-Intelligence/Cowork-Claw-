import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { taskArtifacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createReadStream, statSync } from 'fs'
import { createHmac } from 'crypto'

const HMAC_KEY = process.env.ENCRYPTION_KEY || 'dev-key'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

function verifySignature(id: string, sig: string, exp: string): boolean {
  const now = Math.floor(Date.now() / 1000)
  if (parseInt(exp, 10) < now) return false
  const expected = createHmac('sha256', HMAC_KEY).update(`${id}|${exp}`).digest('hex')
  return sig === expected
}

export function generateArtifactUrl(id: string, baseUrl: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600 // 1 hour
  const sig = createHmac('sha256', HMAC_KEY).update(`${id}|${exp}`).digest('hex')
  return `${baseUrl}/api/artifacts/${id}?sig=${sig}&exp=${exp}`
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const sig = searchParams.get('sig')
  const exp = searchParams.get('exp')

  if (!sig || !exp || !verifySignature(id, sig, exp)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 410 })
  }

  try {
    const [artifact] = await db
      .select()
      .from(taskArtifacts)
      .where(eq(taskArtifacts.id, id))
      .limit(1)

    if (!artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    const stat = statSync(artifact.path)
    const stream = createReadStream(artifact.path)
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      },
    })

    return new Response(webStream, {
      headers: {
        'Content-Type': artifact.mime,
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="${artifact.filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
