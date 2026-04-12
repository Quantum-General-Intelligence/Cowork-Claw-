import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workflowTemplates } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params
  try {
    const [template] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.slug, slug)).limit(1)

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    return NextResponse.json({ template })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}
