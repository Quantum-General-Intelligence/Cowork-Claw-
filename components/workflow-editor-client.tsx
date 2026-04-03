'use client'

import { useEffect, useState } from 'react'
import { useSetAtom } from 'jotai'
import { nodesAtom, edgesAtom, currentWorkflowIdAtom, currentWorkflowNameAtom } from '@/lib/workflow-store'
import { WorkflowCanvas } from '@/components/workflow/workflow-canvas'
import { WorkflowToolbar } from '@/components/workflow/workflow-toolbar'
import { Loader2 } from 'lucide-react'

interface WorkflowEditorClientProps {
  workflowId: string
}

export function WorkflowEditorClient({ workflowId }: WorkflowEditorClientProps) {
  const [loading, setLoading] = useState(true)
  const setNodes = useSetAtom(nodesAtom)
  const setEdges = useSetAtom(edgesAtom)
  const setWorkflowId = useSetAtom(currentWorkflowIdAtom)
  const setWorkflowName = useSetAtom(currentWorkflowNameAtom)

  useEffect(() => {
    setWorkflowId(workflowId)

    fetch(`/api/workflows/${workflowId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.workflow) {
          setNodes(data.workflow.nodes || [])
          setEdges(data.workflow.edges || [])
          setWorkflowName(data.workflow.name || 'Untitled Workflow')
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workflowId, setNodes, setEdges, setWorkflowId, setWorkflowName])

  const handleSave = async () => {
    // Read current atoms via API — we need to get them from the store
    // For simplicity, save is handled via the toolbar which reads atoms directly
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <WorkflowToolbar onSave={handleSave} />
      <div className="flex-1">
        <WorkflowCanvas />
      </div>
    </div>
  )
}
