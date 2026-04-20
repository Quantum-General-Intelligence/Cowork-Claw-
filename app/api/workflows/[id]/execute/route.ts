import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db/client'
import { workflows, workflowExecutions } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { processTaskWithTimeout } from '@/lib/tasks/executor'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const repoUrl = body.repoUrl

    if (!repoUrl) {
      return NextResponse.json({ error: 'repoUrl is required' }, { status: 400 })
    }

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, session.user.id)))
      .limit(1)

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Create execution record
    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        id: generateId(12),
        workflowId: id,
        status: 'running',
      })
      .returning()

    // Pre-fetch context
    const apiKeys = await getUserApiKeys()
    const githubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()

    // Execute workflow nodes sequentially in background
    after(async () => {
      try {
        const nodes = (workflow.nodes as Array<{ data?: { agent?: string; prompt?: string } }>) || []

        for (const node of nodes) {
          if (!node.data?.agent || node.data.agent === 'start') continue

          await processTaskWithTimeout(
            execution.id,
            node.data.prompt || '',
            repoUrl,
            node.data.agent,
            undefined,
            false,
            false,
            { apiKeys, githubToken, githubUser },
          )
        }

        await db
          .update(workflowExecutions)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(workflowExecutions.id, execution.id))
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Workflow execution failed'
        await db
          .update(workflowExecutions)
          .set({ status: 'error', error: errorMsg, completedAt: new Date() })
          .where(eq(workflowExecutions.id, execution.id))
      }
    })

    return NextResponse.json({ execution })
  } catch (error) {
    console.error('Error executing workflow:', error)
    return NextResponse.json({ error: 'Failed to execute workflow' }, { status: 500 })
  }
}
