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

const ORCHESTRATOR_SYSTEM_PROMPT = `You are an AI task orchestrator. Analyze the coding task and decide how to execute it.

Available agents and their strengths:
- claude: Best for complex reasoning, architecture decisions, and multi-file refactors. Supports MCP tools.
- codex: Good for code generation with OpenAI models.
- copilot: Good for GitHub-integrated tasks, uses GitHub Copilot CLI.
- cursor: Strong at code editing with file detection and advanced config.
- gemini: Google's model, good for research and analysis tasks.
- opencode: Open-source code generation, supports multiple models.
- openclaw: Full AI agent runtime with skills (web search, vision, worker-sandboxes).
- pi: Extensible coding agent framework with 15+ LLM providers, stateful sessions, and built-in tools.

Analyze the task, then respond with ONLY a JSON object (no markdown, no explanation):
{
  "plan": "Brief description of your approach",
  "agent": "the best agent for this task",
  "reasoning": "Why this agent is the best choice"
}

Choose the single best agent for the task. Consider the task type, complexity, and agent strengths.`

interface OrchestratorPlan {
  plan: string
  agent: string
  reasoning: string
}

function parseOrchestratorPlan(content: string): OrchestratorPlan | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.agent && parsed.plan) {
      return parsed as OrchestratorPlan
    }
    return null
  } catch {
    return null
  }
}

async function executeSubAgent(
  agent: string,
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
  switch (agent) {
    case 'claude':
      return executeClaudeInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
        taskId,
        agentMessageId,
      )
    case 'codex':
      return executeCodexInSandbox(sandbox, instruction, logger, selectedModel, mcpServers, isResumed, sessionId)
    case 'copilot':
      return executeCopilotInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
        taskId,
      )
    case 'cursor':
      return executeCursorInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
        taskId,
      )
    case 'gemini':
      return executeGeminiInSandbox(sandbox, instruction, logger, selectedModel, mcpServers)
    case 'opencode':
      return executeOpenCodeInSandbox(sandbox, instruction, logger, selectedModel, mcpServers, isResumed, sessionId)
    case 'openclaw':
      return executeOpenClawInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
        taskId,
        agentMessageId,
      )
    case 'pi':
      return executePiInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
        taskId,
        agentMessageId,
      )
    default:
      // Default to Claude for unknown agents
      return executeClaudeInSandbox(
        sandbox,
        instruction,
        logger,
        selectedModel,
        mcpServers,
        isResumed,
        sessionId,
        taskId,
        agentMessageId,
      )
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

  // Create initial agent message
  if (taskId && agentMessageId) {
    try {
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: 'Analyzing task and selecting the best agent...',
      })
    } catch {
      // Message may already exist
    }
  }

  // Step 1: Use OpenClaw to analyze the task and pick the best agent
  const planPrompt = `${ORCHESTRATOR_SYSTEM_PROMPT}\n\nTask to analyze:\n${instruction}`
  const planResult = await executeOpenClawInSandbox(sandbox, planPrompt, logger, selectedModel, mcpServers)

  let chosenAgent = 'claude' // Default fallback
  let plan: OrchestratorPlan | null = null

  if (planResult.success && planResult.agentResponse) {
    plan = parseOrchestratorPlan(planResult.agentResponse)
    if (plan) {
      chosenAgent = plan.agent
      await logger.info(`Orchestrator selected agent: ${chosenAgent}`)
      await logger.info(`Plan: ${plan.plan}`)
      await logger.info(`Reasoning: ${plan.reasoning}`)

      // Update message with plan
      if (taskId && agentMessageId) {
        try {
          await db
            .update(taskMessages)
            .set({
              content: `**Orchestrator Plan**\n\nAgent: ${chosenAgent}\nPlan: ${plan.plan}\nReasoning: ${plan.reasoning}\n\n---\n\nExecuting with ${chosenAgent}...`,
            })
            .where(eq(taskMessages.id, agentMessageId))
        } catch {
          // Ignore
        }
      }
    } else {
      await logger.info('Could not parse orchestrator plan, defaulting to Claude')
    }
  } else {
    await logger.info('Orchestrator analysis failed, defaulting to Claude')
  }

  // Validate chosen agent
  const validAgents = ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode', 'openclaw', 'pi']
  if (!validAgents.includes(chosenAgent)) {
    await logger.info(`Invalid agent "${chosenAgent}", defaulting to Claude`)
    chosenAgent = 'claude'
  }

  // If the orchestrator chose openclaw, the gateway is already running — reuse it
  // For other agents, they install their own CLIs

  // Step 2: Execute the chosen agent
  await logger.info(`Executing task with ${chosenAgent}...`)

  // Generate a new message ID for the sub-agent (the orchestrator message is separate)
  const subAgentMessageId = taskId ? `sub-${agentMessageId || generateSubId()}` : undefined

  const result = await executeSubAgent(
    chosenAgent,
    sandbox,
    instruction,
    logger,
    undefined, // Let sub-agent use its default model
    mcpServers,
    isResumed,
    sessionId,
    taskId,
    subAgentMessageId,
  )

  // Update orchestrator message with final result
  if (taskId && agentMessageId) {
    const finalContent = [
      `**Orchestrator Result**\n`,
      `Agent: ${chosenAgent}`,
      plan ? `Plan: ${plan.plan}` : '',
      plan ? `Reasoning: ${plan.reasoning}` : '',
      `\n---\n`,
      result.success ? 'Task completed successfully.' : `Task failed: ${result.error || 'Unknown error'}`,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await db.update(taskMessages).set({ content: finalContent }).where(eq(taskMessages.id, agentMessageId))
    } catch {
      // Ignore
    }
  }

  return {
    ...result,
    cliName: `orchestrate:${chosenAgent}`,
  }
}

function generateSubId(): string {
  return Math.random().toString(36).substring(2, 14)
}
