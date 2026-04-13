import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { workflowTemplates } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const templates = await db
      .select({
        slug: workflowTemplates.slug,
        name: workflowTemplates.name,
        description: workflowTemplates.description,
        category: workflowTemplates.category,
        icon: workflowTemplates.icon,
        paramsSchema: workflowTemplates.paramsSchema,
        defaultAgent: workflowTemplates.defaultAgent,
      })
      .from(workflowTemplates)
      .orderBy(workflowTemplates.name)

    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ templates: [] })
  }
}
