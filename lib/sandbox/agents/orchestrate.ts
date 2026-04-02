import type { SandboxInstance as Sandbox } from '../provider'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { executeClaudeInSandbox } from './claude'
import { executeCodexInSandbox } from './codex'
import { executeCopilotInSandbox } from './copilot'
import { executeCursorInSandbox } from './cursor'
import { executeGeminiInSandbox } from './gemini'
import { executeOpenCodeInSandbox } from './opencode'
import { executeOpenClawInSandbox } from './openclaw'
import { executePiInSandbox } from './pi'

type Connector = typeof connectors.$inferSelect

const VALID_AGENTS = ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode', 'openclaw', 'pi'] as const

const ORCHESTRATOR_SYSTEM_PROMPT = `You are an AI task orchestrator. Analyze the coding task and decide how to execute it.

Available agents:
- claude: Best for complex reasoning, architecture, multi-file refactors, MCP tools. Needs ANTHROPIC_API_KEY.
- codex: Code generation with OpenAI. Needs AI_GATEWAY_API_KEY.
- copilot: GitHub-native, uses GitHub Copilot CLI. Needs GitHub token.
- cursor: Targeted code editing, file detection. Needs CURSOR_API_KEY.
- gemini: Research, analysis, broad knowledge. Needs GEMINI_API_KEY.
- opencode: Multi-model code generation. Needs OPENAI_API_KEY.
- openclaw: Full AI agent runtime with web search, vision, worker sandboxes.
- pi: Extensible coding agent framework, 15+ LLM providers, stateful sessions.

For the given task, respond with ONLY valid JSON (no markdown fences, no explanation):

For a simple task needing one agent:
{"tasks": [{"agent": "claude", "description": "Full task description"}]}

For a complex task needing multiple agents working sequentially:
{"tasks": [
  {"agent": "claude", "description": "Design the architecture and create interfaces"},
  {"agent": "codex", "description": "Implement the API endpoints based on the interfaces"},
  {"agent": "cursor", "description": "Write tests for the implemented endpoints"}
]}

Rules:
- Each task runs in sequence in the same sandbox (later agents see earlier agents' work)
- Be specific in descriptions — include file names, function names, patterns
- Use 1 agent for simple tasks, 2-4 for complex tasks
- Never use more than 4 agents
- Pick agents based on their strengths, not randomly`

interface SubTask {
  agent: string
  description: string
}

interface OrchestratorPlan {
  tasks: SubTask[]
}

function parseOrchestratorPlan(content: string): OrchestratorPlan | null {
  try {
    // Strip markdown code fences if present
    let cleaned = content.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return null
    }

    // Validate each task
    const validTasks = parsed.tasks.filter(
      (t: SubTask) => t.agent && t.description && VALID_AGENTS.includes(t.agent as (typeof VALID_AGENTS)[number]),
    )

    if (validTasks.length === 0) return null

    return { tasks: validTasks.slice(0, 4) } // Max 4 sub-tasks
  } catch {
    return null
  }
}

async function executeSubAgent(
  agent: string,
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  mcpServers?: Connector[],
  taskId?: string,
): Promise<AgentExecutionResult> {
  // No agentMessageId for sub-agents — orchestrator manages its own message
  switch (agent) {
    case 'claude':
      return executeClaudeInSandbox(sandbox, instruction, logger, undefined, mcpServers, false, undefined, taskId)
    case 'codex':
      return executeCodexInSandbox(sandbox, instruction, logger, undefined, mcpServers)
    case 'copilot':
      return executeCopilotInSandbox(sandbox, instruction, logger, undefined, mcpServers, false, undefined, taskId)
    case 'cursor':
      return executeCursorInSandbox(sandbox, instruction, logger, undefined, mcpServers, false, undefined, taskId)
    case 'gemini':
      return executeGeminiInSandbox(sandbox, instruction, logger, undefined, mcpServers)
    case 'opencode':
      return executeOpenCodeInSandbox(sandbox, instruction, logger, undefined, mcpServers)
    case 'openclaw':
      return executeOpenClawInSandbox(sandbox, instruction, logger, undefined, mcpServers, false, undefined, taskId)
    case 'pi':
      return executePiInSandbox(sandbox, instruction, logger, undefined, mcpServers, false, undefined, taskId)
    default:
      return executeClaudeInSandbox(sandbox, instruction, logger, undefined, mcpServers, false, undefined, taskId)
  }
}

export async function executeOrchestrateInSandbox(
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
  await logger.info('Orchestrator analyzing task...')

  // Create orchestrator message
  if (taskId && agentMessageId) {
    try {
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: 'Analyzing task and creating execution plan...',
      })
    } catch {
      // May already exist
    }
  }

  // Step 1: Use Claude to analyze and plan (Claude is the most reliable for structured output)
  // We call Claude directly with the system prompt, not through OpenClaw
  // This avoids the dependency on OpenClaw being installed just for planning
  const planPrompt = `${ORCHESTRATOR_SYSTEM_PROMPT}\n\nTask:\n${instruction}`

  const planResult = await executeClaudeInSandbox(
    sandbox,
    planPrompt,
    logger,
    undefined,
    undefined,
    false,
    undefined,
    taskId,
  )

  let plan: OrchestratorPlan | null = null

  if (planResult.success && planResult.agentResponse) {
    plan = parseOrchestratorPlan(planResult.agentResponse)
  }

  // If Claude failed or returned invalid plan, fallback to single-agent Claude
  if (!plan) {
    await logger.info('Could not generate execution plan, executing directly with Claude')
    if (taskId && agentMessageId) {
      try {
        await db
          .update(taskMessages)
          .set({ content: 'Executing task directly with Claude (plan generation failed)' })
          .where(eq(taskMessages.id, agentMessageId))
      } catch {
        // Ignore
      }
    }
    const result = await executeClaudeInSandbox(
      sandbox,
      instruction,
      logger,
      selectedModel,
      mcpServers,
      isResumed,
      sessionId,
      taskId,
    )
    return { ...result, cliName: 'orchestrate:claude' }
  }

  // Step 2: Execute the plan — run each sub-task in sequence
  await logger.info(`Execution plan: ${plan.tasks.length} sub-task(s)`)

  const planSummary = plan.tasks.map((t, i) => `${i + 1}. **${t.agent}**: ${t.description}`).join('\n')

  if (taskId && agentMessageId) {
    try {
      await db
        .update(taskMessages)
        .set({ content: `**Execution Plan**\n\n${planSummary}\n\n---\n\nExecuting...` })
        .where(eq(taskMessages.id, agentMessageId))
    } catch {
      // Ignore
    }
  }

  const results: { agent: string; description: string; success: boolean; response?: string }[] = []
  let anyChanges = false
  let lastError: string | undefined

  for (let i = 0; i < plan.tasks.length; i++) {
    const subTask = plan.tasks[i]
    await logger.info(`Sub-task ${i + 1}/${plan.tasks.length}: ${subTask.agent} — ${subTask.description}`)

    // Update message with progress
    if (taskId && agentMessageId) {
      const completedSteps = results
        .map((r, j) => `${j + 1}. **${r.agent}**: ${r.success ? 'Done' : 'Failed'}`)
        .join('\n')
      const currentStep = `${i + 1}. **${subTask.agent}**: Running...`
      const remaining = plan.tasks
        .slice(i + 1)
        .map((t, j) => `${i + j + 2}. **${t.agent}**: Pending`)
        .join('\n')

      try {
        await db
          .update(taskMessages)
          .set({
            content: `**Execution Plan**\n\n${[completedSteps, currentStep, remaining].filter(Boolean).join('\n')}\n\n---\n\nRunning ${subTask.agent}...`,
          })
          .where(eq(taskMessages.id, agentMessageId))
      } catch {
        // Ignore
      }
    }

    const subResult = await executeSubAgent(subTask.agent, sandbox, subTask.description, logger, mcpServers, taskId)

    results.push({
      agent: subTask.agent,
      description: subTask.description,
      success: subResult.success,
      response: subResult.agentResponse,
    })

    if (subResult.changesDetected) {
      anyChanges = true
    }

    if (!subResult.success) {
      lastError = subResult.error
      await logger.error(`Sub-task ${i + 1} failed: ${subResult.error || 'Unknown error'}`)
      // Continue with remaining tasks — partial completion is better than none
    } else {
      await logger.success(`Sub-task ${i + 1} completed`)
    }
  }

  // Step 3: Build final summary
  const allSucceeded = results.every((r) => r.success)
  const finalSummary = results
    .map((r, i) => {
      const status = r.success ? 'Done' : 'Failed'
      return `${i + 1}. **${r.agent}** (${status}): ${r.description}`
    })
    .join('\n')

  const agentsUsed = results.map((r) => r.agent).join(', ')

  if (taskId && agentMessageId) {
    try {
      await db
        .update(taskMessages)
        .set({
          content: `**Orchestration ${allSucceeded ? 'Complete' : 'Partial'}**\n\nAgents: ${agentsUsed}\n\n${finalSummary}`,
        })
        .where(eq(taskMessages.id, agentMessageId))
    } catch {
      // Ignore
    }
  }

  return {
    success: allSucceeded || results.some((r) => r.success),
    error: allSucceeded ? undefined : lastError,
    agentResponse: `Orchestration used ${results.length} agent(s): ${agentsUsed}`,
    cliName: `orchestrate:${agentsUsed}`,
    changesDetected: anyChanges,
  }
}
