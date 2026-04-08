import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { waitlist } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

export async function POST(req: NextRequest) {
  try {
    const { email, githubUsername } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    await db
      .insert(waitlist)
      .values({ id: generateId(12), email: email.trim().toLowerCase(), githubUsername: githubUsername || null })
      .onConflictDoNothing()

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
  }
}
