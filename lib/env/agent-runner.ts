import 'server-only'

import { executeAgentInSandbox, type AgentType, type AgentExecutionResult } from '@/lib/sandbox/agents'
import type { Connector } from '@/lib/db/schema'
import { TaskLogger } from '@/lib/utils/task-logger'
import type { UserEnvInstance } from './user-env-instance'

/**
 * Run a coding/agent task inside a UserEnvInstance.
 *
 * This is a thin wrapper around the existing `executeAgentInSandbox` dispatcher
 * — the per-agent modules (claude/codex/cursor/...) work unchanged because
 * they honor `sandbox.projectDir` and `sandbox.runCommand`, which the
 * UserEnvInstance implements against `sudo -u <user>` SSH.
 */
export interface RunAgentInEnvParams {
  instance: UserEnvInstance
  instruction: string
  agentType: AgentType
  logger: TaskLogger
  selectedModel?: string
  mcpServers?: Connector[]
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  }
  isResumed?: boolean
  sessionId?: string
  taskId?: string
  agentMessageId?: string
  onCancellationCheck?: () => Promise<boolean>
}

export async function runAgentInEnv(params: RunAgentInEnvParams): Promise<AgentExecutionResult> {
  return executeAgentInSandbox(
    params.instance,
    params.instruction,
    params.agentType,
    params.logger,
    params.selectedModel,
    params.mcpServers,
    params.onCancellationCheck,
    params.apiKeys,
    params.isResumed,
    params.sessionId,
    params.taskId,
    params.agentMessageId,
  )
}
