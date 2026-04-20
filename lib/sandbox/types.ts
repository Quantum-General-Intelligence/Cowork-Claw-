import { LogEntry } from '@/lib/db/schema'

/**
 * Result of running a single agent invocation (Claude, Codex, etc.) inside a
 * user environment. Shared between the ephemeral `executeAgentInSandbox` and
 * the persistent-env `runAgentInEnv` wrappers.
 */
export interface AgentExecutionResult {
  success: boolean
  output?: string
  agentResponse?: string
  cliName?: string
  changesDetected?: boolean
  error?: string
  streamingLogs?: unknown[]
  logs?: LogEntry[]
  sessionId?: string // For Cursor agent session resumption
}
