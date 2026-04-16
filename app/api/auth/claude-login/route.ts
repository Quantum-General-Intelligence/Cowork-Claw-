import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { encrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === 'start') {
    const loginId = nanoid(10)

    // Return guided manual instructions — interactive `claude login` cannot be
    // fully automated server-side without a TTY, so we guide the user to run it
    // locally and copy their credentials file.
    return NextResponse.json({
      loginId,
      method: 'manual',
      instructions: {
        steps: [
          'Open your terminal',
          'Run: claude login',
          'Complete the login in your browser',
          'Then run: cat ~/.claude/.credentials.json',
          'Copy the output and paste it on the next screen',
        ],
        copyCommand: 'claude login && cat ~/.claude/.credentials.json | pbcopy',
        copyCommandLinux: 'claude login && cat ~/.claude/.credentials.json | xclip -selection clipboard',
      },
    })
  }

  if (action === 'submit-credentials') {
    const { credentials } = body
    if (!credentials) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    try {
      const parsed = JSON.parse(credentials)
      if (!parsed.claudeAiOauth?.accessToken) {
        return NextResponse.json({ error: 'Invalid credentials format' }, { status: 400 })
      }

      const subType = parsed.claudeAiOauth.subscriptionType || 'unknown'
      const encryptedCreds = encrypt(credentials)

      const existing = await db
        .select()
        .from(keys)
        .where(and(eq(keys.userId, session.user.id), eq(keys.provider, 'claude-subscription')))
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
          provider: 'claude-subscription',
          value: encryptedCreds,
          valid: true,
          lastValidatedAt: new Date(),
        })
      }

      return NextResponse.json({ success: true, subscriptionType: subType })
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
