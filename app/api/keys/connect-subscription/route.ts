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
  const { provider, credentials } = body || {}

  if (!provider || !credentials) {
    return NextResponse.json({ error: 'Missing provider or credentials' }, { status: 400 })
  }

  // Validate based on provider
  if (provider === 'claude-subscription') {
    try {
      const parsed = JSON.parse(credentials)
      if (!parsed.claudeAiOauth?.accessToken || !parsed.claudeAiOauth?.refreshToken) {
        return NextResponse.json(
          { error: 'Invalid Claude credentials — missing accessToken or refreshToken' },
          { status: 400 },
        )
      }
      // Check subscription type
      const subType = parsed.claudeAiOauth.subscriptionType
      if (!subType) {
        return NextResponse.json({ error: 'No subscription found in credentials' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
  } else if (provider === 'gemini-subscription') {
    // For Gemini, just validate it's non-empty
    if (credentials.length < 10) {
      return NextResponse.json({ error: 'Invalid Gemini credentials' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
  }

  // Encrypt and store
  const encryptedCreds = encrypt(credentials)
  const existing = await db
    .select()
    .from(keys)
    .where(
      and(
        eq(keys.userId, session.user.id),
        eq(keys.provider, provider as 'claude-subscription' | 'gemini-subscription'),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(keys)
      .set({ value: encryptedCreds, valid: true, lastValidatedAt: new Date(), updatedAt: new Date() })
      .where(eq(keys.id, existing[0].id))
  } else {
    await db.insert(keys).values({
      id: nanoid(),
      userId: session.user.id,
      provider: provider as 'claude-subscription' | 'gemini-subscription',
      value: encryptedCreds,
      valid: true,
      lastValidatedAt: new Date(),
    })
  }

  return NextResponse.json({ success: true, provider })
}
