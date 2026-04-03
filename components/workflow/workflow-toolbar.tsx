'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Play, Save, Loader2 } from 'lucide-react'
import { useAtom } from 'jotai'
import { currentWorkflowNameAtom, isExecutingAtom, currentWorkflowIdAtom } from '@/lib/workflow-store'

interface WorkflowToolbarProps {
  onExecute?: () => void
  onSave?: () => void
}

export function WorkflowToolbar({ onExecute, onSave }: WorkflowToolbarProps) {
  const [name, setName] = useAtom(currentWorkflowNameAtom)
  const [isExecuting] = useAtom(isExecutingAtom)
  const [workflowId] = useAtom(currentWorkflowIdAtom)

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-64 text-sm font-medium border-0 bg-transparent focus-visible:ring-1"
        placeholder="Workflow name..."
      />

      <div className="flex items-center gap-2">
        {workflowId && onSave && (
          <Button variant="outline" size="sm" onClick={onSave} className="h-8 gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        )}
        {onExecute && (
          <Button size="sm" onClick={onExecute} disabled={isExecuting} className="h-8 gap-1.5 text-xs">
            {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {isExecuting ? 'Running...' : 'Execute'}
          </Button>
        )}
      </div>
    </div>
  )
}
