import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { encrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const apiKey = body?.apiKey
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    return NextResponse.json({ valid: false, error: 'Invalid key format' }, { status: 400 })
  }

  // Validate against Anthropic API with a minimal request
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ valid: false, error: 'Key rejected by Anthropic' }, { status: 200 })
    }

    // Key is valid — encrypt and store/update
    const encryptedKey = encrypt(apiKey)
    const existing = await db
      .select()
      .from(keys)
      .where(and(eq(keys.userId, session.user.id), eq(keys.provider, 'anthropic')))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(keys)
        .set({
          value: encryptedKey,
          valid: true,
          lastValidatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(keys.id, existing[0].id))
    } else {
      await db.insert(keys).values({
        id: nanoid(),
        userId: session.user.id,
        provider: 'anthropic',
        value: encryptedKey,
        valid: true,
        lastValidatedAt: new Date(),
      })
    }

    return NextResponse.json({ valid: true })
  } catch {
    return NextResponse.json({ valid: false, error: 'Validation failed' }, { status: 200 })
  }
}
