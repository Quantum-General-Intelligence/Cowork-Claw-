'use client'

import { Handle, Position } from '@xyflow/react'
import { Play } from 'lucide-react'

export function TriggerNode() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
      <div className="rounded-full bg-green-500/10 p-1.5">
        <Play className="h-3.5 w-3.5 text-green-500" />
      </div>
      <span className="text-sm font-medium">Start</span>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-2.5 !h-2.5" />
    </div>
  )
}
