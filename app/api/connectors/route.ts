import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { connectors } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq } from 'drizzle-orm'

export async function GET() {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          data: [],
        },
        { status: 401 },
      )
    }

    const userConnectors = await db.select().from(connectors).where(eq(connectors.userId, session.user.id))

    const decryptedConnectors = userConnectors.map((connector) => ({
      ...connector,
      oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
      env: connector.env ? JSON.parse(decrypt(connector.env)) : null,
    }))

    return NextResponse.json({
      success: true,
      data: decryptedConnectors,
    })
  } catch (error) {
    console.error('Error fetching connectors:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch connectors',
        data: [],
      },
      { status: 500 },
    )
  }
}
