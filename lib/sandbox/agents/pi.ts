import type { SandboxInstance as Sandbox } from '../provider'
import { runCommandInSandbox, runInProject } from '../commands'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'

type Connector = typeof connectors.$inferSelect

/**
 * Resolve provider/model from the selected model string.
 * Pi uses "provider/model" format — e.g. "anthropic/claude-sonnet-4-5"
 */
function resolveProviderModel(selectedModel?: string): { provider: string; model: string; envVar: string } {
  if (selectedModel) {
    // Already in provider/model format
    if (selectedModel.includes('/')) {
      const [provider] = selectedModel.split('/')
      const envMap: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        google: 'GOOGLE_API_KEY',
      }
      return { provider, model: selectedModel, envVar: envMap[provider] || 'ANTHROPIC_API_KEY' }
    }
    // Bare model name — infer provider
    if (
      selectedModel.startsWith('claude') ||
      selectedModel.startsWith('sonnet') ||
      selectedModel.startsWith('opus') ||
      selectedModel.startsWith('haiku')
    ) {
      return { provider: 'anthropic', model: `anthropic/${selectedModel}`, envVar: 'ANTHROPIC_API_KEY' }
    }
    if (selectedModel.startsWith('gpt') || selectedModel.startsWith('o1') || selectedModel.startsWith('o3')) {
      return { provider: 'openai', model: `openai/${selectedModel}`, envVar: 'OPENAI_API_KEY' }
    }
    if (selectedModel.startsWith('gemini')) {
      return { provider: 'google', model: `google/${selectedModel}`, envVar: 'GOOGLE_API_KEY' }
    }
  }

  // Default: Anthropic
  return { provider: 'anthropic', model: 'anthropic/claude-sonnet-4-5', envVar: 'ANTHROPIC_API_KEY' }
}

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

    // Verify binary exists
    const verifyCheck = await runCommandInSandbox(sandbox, 'which', ['pi'])
    if (!verifyCheck.success) {
      await logger.error('Pi binary not found after installation')
      return {
        success: false,
        error: 'Pi binary not found after installation',
        cliName: 'pi',
        changesDetected: false,
      }
    }

    await logger.info('Pi coding agent installed successfully')
  } else {
    await logger.info('Pi coding agent already installed')
  }

  // Step 2: Resolve model and configure API key
  const { model, envVar } = resolveProviderModel(selectedModel)
  const apiKey = process.env[envVar] || process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY

  if (!apiKey) {
    return {
      success: false,
      error: `No API key available for Pi agent (needs ${envVar})`,
      cliName: 'pi',
      changesDetected: false,
    }
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

  // Step 4: Build environment variables
  const envVars: string[] = []
  if (process.env.ANTHROPIC_API_KEY) envVars.push(`ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY}"`)
  if (process.env.OPENAI_API_KEY) envVars.push(`OPENAI_API_KEY="${process.env.OPENAI_API_KEY}"`)
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    envVars.push(`GOOGLE_API_KEY="${process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY}"`)
  }

  // Write prompt to file to avoid shell escaping issues
  await runCommandInSandbox(sandbox, 'sh', ['-c', `cat > /tmp/pi-prompt.txt << 'PIEOF'\n${instruction}\nPIEOF`])

  // Build pi command
  // --print (-p): non-interactive, process prompt and exit
  // --model: provider/model format
  // --no-session: don't persist session
  // --continue (-c) + --session: resume previous session
  // Build flags: resumed sessions use -c, fresh runs use --no-session
  const flags: string[] =
    isResumed && sessionId
      ? ['-p', '--model', model, '-c', '--session', sessionId]
      : ['-p', '--model', model, '--no-session']

  const piCommand = `${envVars.join(' ')} pi ${flags.join(' ')} "$(cat /tmp/pi-prompt.txt)"`

  const result = await runInProject(sandbox, 'sh', ['-c', piCommand])

  const agentOutput = result.output || ''

  if (!result.success && !agentOutput) {
    await logger.error('Pi agent execution failed')
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

  // Update the agent message with the response
  if (taskId && agentMessageId && agentOutput) {
    try {
      await db.update(taskMessages).set({ content: agentOutput }).where(eq(taskMessages.id, agentMessageId))
    } catch {
      // Ignore
    }
  }

  // Consider success if we got output, even if exit code was non-zero
  // (Pi may exit with code 1 after making changes)
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
