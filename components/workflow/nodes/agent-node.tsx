'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode, OpenClaw, Pi } from '@/components/logos'
import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentNodeData } from '@/lib/workflow-store'

const AGENT_LOGOS: Record<string, React.ComponentType<{ className?: string }>> = {
  claude: Claude,
  codex: Codex,
  copilot: Copilot,
  cursor: Cursor,
  gemini: Gemini,
  opencode: OpenCode,
  openclaw: OpenClaw,
  orchestrate: OpenClaw,
  pi: Pi,
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/5', border: 'border-blue-500/30' },
  done: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/5', border: 'border-green-500/30' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/5', border: 'border-red-500/30' },
}

export function AgentNode({ data, selected }: NodeProps) {
  const agentData = data as AgentNodeData
  const AgentLogo = AGENT_LOGOS[agentData.agent] || OpenClaw
  const status = STATUS_CONFIG[agentData.status] || STATUS_CONFIG.pending
  const StatusIcon = status.icon

  return (
    <div
      className={cn(
        'rounded-lg border bg-background shadow-sm w-[280px] transition-all',
        status.border,
        selected && 'ring-2 ring-primary/50',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2.5 !h-2.5" />

      <div className={cn('flex items-start gap-3 p-3', status.bg)}>
        <div className="flex-shrink-0 mt-0.5">
          <AgentLogo className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold capitalize">{agentData.agent}</span>
            <StatusIcon
              className={cn(
                'h-3.5 w-3.5 flex-shrink-0',
                status.color,
                agentData.status === 'running' && 'animate-spin',
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{agentData.prompt}</p>
          {agentData.error && <p className="text-xs text-red-500 mt-1 truncate">{agentData.error}</p>}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2.5 !h-2.5" />
    </div>
  )
}
