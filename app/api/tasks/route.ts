import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { processTaskWithTimeout } from '@/lib/tasks/executor'
import { eq, desc, or, and, isNull } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { generateTaskTitle, createFallbackTitle } from '@/lib/utils/title-generator'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getMaxSandboxDuration } from '@/lib/db/settings'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))

    return NextResponse.json({ tasks: userTasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = await checkRateLimit(session.user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have reached the daily limit of ${rateLimit.total} messages (tasks + follow-ups). Your limit will reset at ${rateLimit.resetAt.toISOString()}`,
          remaining: rateLimit.remaining,
          total: rateLimit.total,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 },
      )
    }

    const body = await request.json()

    const taskId = body.id || generateId(12)
    const validatedData = insertTaskSchema.parse({
      ...body,
      id: taskId,
      userId: session.user.id,
      status: 'pending',
      progress: 0,
      logs: [],
    })

    const [newTask] = await db
      .insert(tasks)
      .values({
        ...validatedData,
        id: taskId,
      })
      .returning()

    // Generate AI branch name (non-blocking)
    after(async () => {
      try {
        if (!process.env.AI_GATEWAY_API_KEY) return

        const logger = createTaskLogger(taskId)
        await logger.info('Generating AI-powered branch name...')

        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore
        }

        const aiBranchName = await generateBranchName({
          description: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        await db.update(tasks).set({ branchName: aiBranchName, updatedAt: new Date() }).where(eq(tasks.id, taskId))
        await logger.success('Generated AI branch name')
      } catch (error) {
        console.error('Error generating AI branch name:', error)
        const fallbackBranchName = createFallbackBranchName(taskId)
        try {
          await db
            .update(tasks)
            .set({ branchName: fallbackBranchName, updatedAt: new Date() })
            .where(eq(tasks.id, taskId))
        } catch {
          // Ignore
        }
      }
    })

    // Generate AI title (non-blocking)
    after(async () => {
      try {
        if (!process.env.AI_GATEWAY_API_KEY) return

        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore
        }

        const aiTitle = await generateTaskTitle({
          prompt: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        await db.update(tasks).set({ title: aiTitle, updatedAt: new Date() }).where(eq(tasks.id, taskId))
      } catch (error) {
        console.error('Error generating AI title:', error)
        const fallbackTitle = createFallbackTitle(validatedData.prompt)
        try {
          await db.update(tasks).set({ title: fallbackTitle, updatedAt: new Date() }).where(eq(tasks.id, taskId))
        } catch {
          // Ignore
        }
      }
    })

    // Pre-fetch context BEFORE entering after() (session not available inside after)
    const userApiKeys = await getUserApiKeys()
    const userGithubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)

    // Process task asynchronously
    after(async () => {
      try {
        await processTaskWithTimeout(
          newTask.id,
          validatedData.prompt,
          validatedData.repoUrl || '',
          validatedData.maxDuration || maxSandboxDuration,
          validatedData.selectedAgent || 'claude',
          validatedData.selectedModel,
          validatedData.installDependencies || false,
          validatedData.keepAlive || false,
          validatedData.enableBrowser || false,
          { apiKeys: userApiKeys, githubToken: userGithubToken, githubUser },
        )
      } catch (error) {
        console.error('Task processing failed:', error)
        try {
          const [task] = await db.select().from(tasks).where(eq(tasks.id, newTask.id)).limit(1)
          if (task && task.status === 'processing') {
            const errorMsg = error instanceof Error ? error.message : 'Task processing failed unexpectedly'
            await db.update(tasks).set({ status: 'error', updatedAt: new Date() }).where(eq(tasks.id, newTask.id))
            const errorLogger = createTaskLogger(newTask.id)
            await errorLogger.updateStatus('error', errorMsg)
          }
        } catch {
          // Last resort
        }
      }
    })

    return NextResponse.json({ task: newTask })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required' }, { status: 400 })
    }

    const actions = action.split(',').map((a) => a.trim())
    const validActions = ['completed', 'failed', 'stopped']
    const invalidActions = actions.filter((a) => !validActions.includes(a))

    if (invalidActions.length > 0) {
      return NextResponse.json(
        { error: `Invalid action(s): ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}` },
        { status: 400 },
      )
    }

    const statusConditions = []
    if (actions.includes('completed')) statusConditions.push(eq(tasks.status, 'completed'))
    if (actions.includes('failed')) statusConditions.push(eq(tasks.status, 'error'))
    if (actions.includes('stopped')) statusConditions.push(eq(tasks.status, 'stopped'))

    if (statusConditions.length === 0) {
      return NextResponse.json({ error: 'No valid actions specified' }, { status: 400 })
    }

    const statusClause = statusConditions.length === 1 ? statusConditions[0] : or(...statusConditions)
    const whereClause = and(statusClause, eq(tasks.userId, session.user.id))
    const deletedTasks = await db.delete(tasks).where(whereClause).returning()

    const actionMessages = []
    if (actions.includes('completed')) {
      const count = deletedTasks.filter((t) => t.status === 'completed').length
      if (count > 0) actionMessages.push(`${count} completed`)
    }
    if (actions.includes('failed')) {
      const count = deletedTasks.filter((t) => t.status === 'error').length
      if (count > 0) actionMessages.push(`${count} failed`)
    }
    if (actions.includes('stopped')) {
      const count = deletedTasks.filter((t) => t.status === 'stopped').length
      if (count > 0) actionMessages.push(`${count} stopped`)
    }

    const message =
      actionMessages.length > 0
        ? `${actionMessages.join(' and ')} task(s) deleted successfully`
        : 'No tasks found to delete'

    return NextResponse.json({ message, deletedCount: deletedTasks.length })
  } catch (error) {
    console.error('Error deleting tasks:', error)
    return NextResponse.json({ error: 'Failed to delete tasks' }, { status: 500 })
  }
}
