import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks, taskMessages, connectors } from '@/lib/db/schema'
import { eq, and, asc, isNull } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch } from '@/lib/sandbox/git'
import { prepareEnvTask, resumeEnvTask } from '@/lib/env/run-task'
import type { UserEnvInstance } from '@/lib/env/user-env-instance'
import { decrypt } from '@/lib/crypto'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'

export async function POST(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
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

    const { taskId } = await context.params
    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.branchName) {
      return NextResponse.json({ error: 'Task does not have a branch to continue from' }, { status: 400 })
    }

    await db.insert(taskMessages).values({
      id: generateId(12),
      taskId,
      role: 'user',
      content: message.trim(),
    })

    await db
      .update(tasks)
      .set({
        status: 'processing',
        progress: 0,
        updatedAt: new Date(),
        completedAt: null,
      })
      .where(eq(tasks.id, taskId))

    const userApiKeys = await getUserApiKeys()
    const userGithubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()

    after(async () => {
      await continueTask(
        taskId,
        message.trim(),
        task.repoUrl || '',
        task.branchName || '',
        task.selectedAgent || 'claude',
        task.selectedModel || undefined,
        userApiKeys,
        userGithubToken,
        githubUser,
        task.enableBrowser || false,
      )
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error continuing task:', error)
    return NextResponse.json({ error: 'Failed to continue task' }, { status: 500 })
  }
}

async function continueTask(
  taskId: string,
  prompt: string,
  repoUrl: string,
  branchName: string,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
  githubToken?: string | null,
  githubUser?: {
    username: string
    name: string | null
    email: string | null
  } | null,
  enableBrowser: boolean = false,
) {
  let sandbox: UserEnvInstance | null = null
  let isResumedSandbox = false
  const logger = createTaskLogger(taskId)

  try {
    console.log('Continuing task with new message')

    await logger.updateStatus('processing', 'Processing follow-up message...')
    await logger.updateProgress(10, 'Initializing continuation...')

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }

    const [currentTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

    if (!currentTask) {
      throw new Error('Task not found')
    }

    if (currentTask.environmentId && currentTask.workdir) {
      const resumed = await resumeEnvTask(taskId)
      if (resumed) {
        await logger.info('Reusing persistent environment')
        sandbox = resumed
        isResumedSandbox = true
        await logger.updateProgress(50, 'Executing agent with follow-up message')
      } else {
        await logger.info('Environment no longer available, re-preparing')
      }
    }

    if (!sandbox) {
      await logger.updateProgress(15, 'Preparing your environment')
      const envResult = await prepareEnvTask(
        {
          userId: currentTask.userId,
          taskId,
          repoUrl: repoUrl || null,
          preDeterminedBranchName: branchName,
          githubToken,
          gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
          gitAuthorEmail: githubUser?.username
            ? `${githubUser.username}@users.noreply.github.com`
            : 'agent@example.com',
        },
        logger,
      )
      if (!envResult.success) {
        throw new Error(envResult.error || 'Failed to prepare environment')
      }
      sandbox = envResult.instance ?? null
      await db
        .update(tasks)
        .set({
          environmentId: envResult.environment?.id,
          workdir: envResult.workdir,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
    }

    console.log('Starting agent execution')

    const previousMessages = await db
      .select()
      .from(taskMessages)
      .where(eq(taskMessages.taskId, taskId))
      .orderBy(asc(taskMessages.createdAt))
      .limit(10)

    const contextMessages = previousMessages.slice(-6, -1)

    let sanitizedPrompt = prompt.replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/^-/gm, ' -')

    if (enableBrowser) {
      sanitizedPrompt = `[Browser automation is available via agent-browser CLI.]\n\n${sanitizedPrompt}`
    }

    let promptWithContext = sanitizedPrompt
    if (contextMessages.length > 0 && !isResumedSandbox) {
      let conversationHistory = '\n\n---\n\nFor context, here is the conversation history from this session:\n\n'
      contextMessages.forEach((msg) => {
        const role = msg.role === 'user' ? 'User' : 'A'
        const truncatedContent = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content
        const sanitizedContent = truncatedContent
          .replace(/`/g, "'")
          .replace(/\$/g, '')
          .replace(/\\/g, '')
          .replace(/^-/gm, ' -')
        conversationHistory += `${role}: ${sanitizedContent}\n\n`
      })
      promptWithContext = `${sanitizedPrompt}${conversationHistory}`
    }

    type Connector = typeof connectors.$inferSelect
    let mcpServers: Connector[] = []

    try {
      const session = await getServerSession()
      if (session?.user?.id) {
        const userConnectors = await db
          .select()
          .from(connectors)
          .where(and(eq(connectors.userId, session.user.id), eq(connectors.status, 'connected')))

        mcpServers = userConnectors.map((connector: Connector) => {
          const decryptedEnv = connector.env ? JSON.parse(decrypt(connector.env)) : null
          return {
            ...connector,
            env: decryptedEnv,
            oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
          }
        })

        if (mcpServers.length > 0) {
          await logger.info('Found connected MCP servers')
        }
      }
    } catch (mcpError) {
      console.error('Failed to fetch MCP servers:', mcpError)
      await logger.info('Warning: Could not fetch MCP servers, continuing without them')
    }

    if (!sandbox) {
      throw new Error('Environment is not available for agent execution')
    }

    const agentMessageId = generateId()

    const agentResult = await executeAgentInSandbox(
      sandbox,
      promptWithContext,
      selectedAgent as AgentType,
      logger,
      selectedModel,
      mcpServers,
      undefined,
      apiKeys,
      isResumedSandbox,
      currentTask.agentSessionId || undefined,
      taskId,
      agentMessageId,
    )

    console.log('Agent execution completed')

    if (agentResult.sessionId) {
      await db.update(tasks).set({ agentSessionId: agentResult.sessionId }).where(eq(tasks.id, taskId))
    }

    if (agentResult.success) {
      await logger.success('Agent execution completed')
      await logger.info('Code changes applied successfully')

      if (agentResult.agentResponse) {
        try {
          await db.insert(taskMessages).values({
            id: generateId(12),
            taskId,
            role: 'agent',
            content: agentResult.agentResponse,
          })
        } catch (error) {
          console.error('Failed to save agent message:', error)
        }
      }

      let commitMessage: string
      try {
        let repoName: string | undefined
        try {
          const url = new URL(repoUrl)
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // ignore
        }

        if (process.env.AI_GATEWAY_API_KEY) {
          commitMessage = await generateCommitMessage({
            description: prompt,
            repoName,
            context: `${selectedAgent} agent follow-up`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(prompt)
        }
      } catch (error) {
        console.error('Error generating commit message:', error)
        commitMessage = createFallbackCommitMessage(prompt)
      }

      let pushResult: { success: boolean; pushFailed?: boolean } = { success: true, pushFailed: false }
      if (branchName) {
        pushResult = await pushChangesToBranch(sandbox, branchName, commitMessage, logger)
      }

      await logger.info('Environment kept alive (persistent)')

      if (pushResult.pushFailed) {
        await logger.updateStatus('error')
        await logger.error('Task failed: Unable to push changes to repository')
        throw new Error('Failed to push changes to repository')
      } else {
        await logger.updateStatus('completed')
        await logger.updateProgress(100, 'Task completed successfully')
        console.log('Task continuation completed successfully')
      }
    } else {
      await logger.error('Agent execution failed')
      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error continuing task:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('Detailed error:', {
      message: errorMessage,
      stack: errorStack,
      taskId,
    })

    await logger.updateStatus('error')
    await logger.error('Task failed to continue')
    console.error('Task error details:', errorMessage)

    await db
      .update(tasks)
      .set({
        error: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
  }
}
