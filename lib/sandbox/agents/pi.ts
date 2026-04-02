import type { SandboxInstance as Sandbox } from '../provider'
import { runCommandInSandbox, runInProject } from '../commands'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

type Connector = typeof connectors.$inferSelect

export async function executePiInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
  agentMessageId?: string,
): Promise<AgentExecutionResult> {
  // Step 1: Check if pi CLI is already installed
  const existingCheck = await runCommandInSandbox(sandbox, 'which', ['pi'])

  if (!existingCheck.success || !existingCheck.output?.includes('pi')) {
    await logger.info('Installing Pi coding agent...')
    const install = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', '@mariozechner/pi-coding-agent'])

    if (!install.success) {
      await logger.error('Failed to install Pi coding agent')
      return {
        success: false,
        error: 'Failed to install Pi coding agent',
        cliName: 'pi',
        changesDetected: false,
      }
    }
    await logger.info('Pi coding agent installed successfully')
  } else {
    await logger.info('Pi coding agent already installed')
  }

  // Step 2: Configure API key
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      success: false,
      error: 'No API key available for Pi agent (needs ANTHROPIC_API_KEY, AI_GATEWAY_API_KEY, or OPENAI_API_KEY)',
      cliName: 'pi',
      changesDetected: false,
    }
  }

  // Determine provider and model
  let provider = 'anthropic'
  let model = selectedModel || 'claude-sonnet-4-5'

  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    provider = 'openai'
    model = selectedModel || 'gpt-5'
  }

  // Step 3: Create agent message for streaming updates
  if (taskId && agentMessageId) {
    try {
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: '',
      })
    } catch {
      // Message may already exist
    }
  }

  await logger.info('Running Pi coding agent...')

  // Step 4: Build command
  // Pi in print mode (-p) runs headless and exits after completion
  const envVars = [`ANTHROPIC_API_KEY="${apiKey}"`]
  if (process.env.OPENAI_API_KEY) {
    envVars.push(`OPENAI_API_KEY="${process.env.OPENAI_API_KEY}"`)
  }
  if (process.env.GEMINI_API_KEY) {
    envVars.push(`GOOGLE_API_KEY="${process.env.GEMINI_API_KEY}"`)
  }

  // Escape the instruction for shell
  const escapedInstruction = instruction.replace(/'/g, "'\\''")

  // Resume session if available
  const resumeFlag = isResumed && sessionId ? ` -c --session '${sessionId}'` : ''

  const piCommand = `${envVars.join(' ')} pi -p --model ${provider}/${model} --no-session${resumeFlag} '${escapedInstruction}'`

  const result = await runInProject(sandbox, 'sh', ['-c', piCommand])

  if (!result.success) {
    await logger.error('Pi agent execution failed')

    // Update message with error
    if (taskId && agentMessageId) {
      try {
        await db
          .update(taskMessages)
          .set({ content: result.error || 'Pi agent execution failed' })
          .where(eq(taskMessages.id, agentMessageId))
      } catch {
        // Ignore
      }
    }

    return {
      success: false,
      error: result.error || 'Pi agent execution failed',
      cliName: 'pi',
      changesDetected: false,
    }
  }

  const agentOutput = result.output || ''

  // Update the agent message with the response
  if (taskId && agentMessageId && agentOutput) {
    try {
      await db.update(taskMessages).set({ content: agentOutput }).where(eq(taskMessages.id, agentMessageId))
    } catch {
      // Ignore
    }
  }

  await logger.success('Pi agent execution completed')

  // Check for git changes
  const gitStatus = await runInProject(sandbox, 'git', ['status', '--porcelain'])
  const changesDetected = gitStatus.success && (gitStatus.output?.trim().length ?? 0) > 0

  return {
    success: true,
    agentResponse: agentOutput,
    cliName: 'pi',
    changesDetected,
  }
}
