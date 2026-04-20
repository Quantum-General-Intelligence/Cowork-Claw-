import { db } from '@/lib/db/client'
import { tasks, connectors, taskMessages } from '@/lib/db/schema'
import { emitActivity } from '@/lib/activity/emit'
import { generateId } from '@/lib/utils/id'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch } from '@/lib/sandbox/git'
import { prepareEnvTask, registerEnvArtifacts } from '@/lib/env/run-task'
import { eq, and } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'
import type { UserEnvInstance } from '@/lib/env/user-env-instance'

export interface TaskExecutionContext {
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  }
  githubToken?: string | null
  githubUser?: {
    username: string
    name: string | null
    email: string | null
  } | null
}

const DEFAULT_TASK_TIMEOUT_MIN = 60

// Poll the DB every 500ms for the AI-generated branch name so we can use it
// as the checkout ref once the env is ready. Bounded by maxWaitMs.
async function waitForBranchName(taskId: string, maxWaitMs: number = 10000): Promise<string | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
      if (task?.branchName) {
        return task.branchName
      }
    } catch (error) {
      console.error('Error checking for branch name:', error)
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return null
}

async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return task?.status === 'stopped'
  } catch (error) {
    console.error('Error checking task status:', error)
    return false
  }
}

export async function processTaskWithTimeout(
  taskId: string,
  prompt: string,
  repoUrl: string,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  enableBrowser: boolean = false,
  context?: TaskExecutionContext,
) {
  const TASK_TIMEOUT_MS = DEFAULT_TASK_TIMEOUT_MIN * 60 * 1000

  const warningTimeMs = Math.max(TASK_TIMEOUT_MS - 60 * 1000, 0)
  const warningTimeout = setTimeout(async () => {
    try {
      const warningLogger = createTaskLogger(taskId)
      await warningLogger.info('Task is approaching timeout, will complete soon')
    } catch (error) {
      console.error('Failed to add timeout warning:', error)
    }
  }, warningTimeMs)

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Task execution timed out'))
    }, TASK_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      processTask(
        taskId,
        prompt,
        repoUrl,
        selectedAgent,
        selectedModel,
        installDependencies,
        enableBrowser,
        context?.apiKeys,
        context?.githubToken,
        context?.githubUser,
      ),
      timeoutPromise,
    ])

    clearTimeout(warningTimeout)
  } catch (error: unknown) {
    clearTimeout(warningTimeout)
    if (error instanceof Error && error.message?.includes('timed out')) {
      console.error('Task timed out:', taskId)
      const timeoutLogger = createTaskLogger(taskId)
      await timeoutLogger.error('Task execution timed out')
      await timeoutLogger.updateStatus('error', 'Task execution timed out. The operation took too long to complete.')
    } else {
      throw error
    }
  }
}

async function processTask(
  taskId: string,
  prompt: string,
  repoUrl: string,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  _installDependencies: boolean = false,
  enableBrowser: boolean = false,
  apiKeys?: TaskExecutionContext['apiKeys'],
  githubToken?: string | null,
  githubUser?: TaskExecutionContext['githubUser'],
) {
  let sandbox: UserEnvInstance | null = null
  const logger = createTaskLogger(taskId)

  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!taskRow) {
    console.error('Task not found during processing:', taskId)
    return
  }

  try {
    console.log('Starting task processing')

    await logger.updateStatus('processing', 'Task created, preparing to start...')
    await logger.updateProgress(10, 'Initializing task execution...')

    try {
      await db.insert(taskMessages).values({
        id: generateId(12),
        taskId,
        role: 'user',
        content: prompt,
      })
    } catch (error) {
      console.error('Failed to save user message:', error)
    }

    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }
    await logger.info('API keys configured for selected agent')

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before execution began')
      return
    }

    const aiBranchName = await waitForBranchName(taskId, 10000)

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during branch name generation')
      return
    }

    if (aiBranchName) {
      await logger.info('Using AI-generated branch name')
    } else {
      await logger.info('AI branch name not ready, will use fallback')
    }

    await logger.updateProgress(15, 'Preparing your environment')

    const envResult = await prepareEnvTask(
      {
        userId: taskRow.userId,
        taskId,
        repoUrl: repoUrl || null,
        preDeterminedBranchName: aiBranchName,
        githubToken,
        gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
        gitAuthorEmail: githubUser?.username ? `${githubUser.username}@users.noreply.github.com` : 'agent@example.com',
        onCancellationCheck: () => isTaskStopped(taskId),
      },
      logger,
    )

    if (!envResult.success) {
      if (envResult.cancelled) {
        await logger.info('Task was cancelled during environment preparation')
        return
      }
      throw new Error(envResult.error || 'Failed to prepare environment')
    }

    sandbox = envResult.instance ?? null
    const branchName = envResult.branchName

    const envUpdate: {
      environmentId?: string
      workdir?: string
      updatedAt: Date
      branchName?: string
    } = {
      environmentId: envResult.environment?.id,
      workdir: envResult.workdir,
      updatedAt: new Date(),
    }
    if (!aiBranchName && branchName) envUpdate.branchName = branchName
    await db.update(tasks).set(envUpdate).where(eq(tasks.id, taskId))

    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before agent execution')
      return
    }

    await logger.updateProgress(50, 'Installing and executing agent')

    if (!sandbox) {
      throw new Error('Environment is not available for agent execution')
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
          await db
            .update(tasks)
            .set({
              mcpServerIds: JSON.parse(JSON.stringify(mcpServers.map((s) => s.id))),
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        }
      }
    } catch (mcpError) {
      console.error('Failed to fetch MCP servers:', mcpError)
      await logger.info('Warning: Could not fetch MCP servers, continuing without them')
    }

    let sanitizedPrompt = prompt.replace(/`/g, "'").replace(/\$/g, '').replace(/\\/g, '').replace(/^-/gm, ' -')

    if (enableBrowser) {
      sanitizedPrompt = `[Browser automation is available. Use the agent-browser CLI to navigate websites, interact with pages, take screenshots, and extract data. Start with: agent-browser open <url>, then agent-browser snapshot -i to see interactive elements.]\n\n${sanitizedPrompt}`
    }

    const agentMessageId = generateId()

    const agentResult = await executeAgentInSandbox(
      sandbox,
      sanitizedPrompt,
      selectedAgent as AgentType,
      logger,
      selectedModel,
      mcpServers,
      undefined,
      apiKeys,
      undefined,
      undefined,
      taskId,
      agentMessageId,
    )

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
            context: `${selectedAgent} agent task`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(prompt)
        }
      } catch {
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
      }

      await logger.updateStatus('completed')
      await logger.updateProgress(100, 'Task completed successfully')

      try {
        const [currentTaskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
        if (currentTaskRow?.workdir) {
          const artifactCount = await registerEnvArtifacts({
            instance: sandbox,
            taskId,
            userId: currentTaskRow.userId,
            workdir: currentTaskRow.workdir,
          })
          if (artifactCount > 0) {
            await logger.info('Deliverables registered')
          }
        }
      } catch {
        // non-fatal
      }

      const [completedTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
      if (completedTask) {
        await emitActivity(completedTask.userId, 'task_completed', 'task', taskId, {
          agent: selectedAgent,
          prompt: prompt.slice(0, 200),
        })
      }
    } else {
      await logger.error('Agent execution failed')
      throw new Error(agentResult.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error processing task:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    await logger.error('Error occurred during task processing')
    await logger.updateStatus('error', errorMessage)

    const [failedTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (failedTask) {
      await emitActivity(failedTask.userId, 'task_error', 'task', taskId, { error: errorMessage })
    }
  }
}
