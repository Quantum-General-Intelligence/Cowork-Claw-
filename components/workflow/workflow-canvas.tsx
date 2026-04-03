'use client'

import { useCallback } from 'react'
import { ReactFlow, Background, Controls, type Connection, addEdge, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAtom, useSetAtom } from 'jotai'
import {
  nodesAtom,
  edgesAtom,
  onNodesChangeAtom,
  onEdgesChangeAtom,
  selectedNodeAtom,
  type WorkflowNode,
  type WorkflowEdge,
} from '@/lib/workflow-store'
import { TriggerNode } from './nodes/trigger-node'
import { AgentNode } from './nodes/agent-node'

const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
}

interface WorkflowCanvasProps {
  initialNodes?: WorkflowNode[]
  initialEdges?: WorkflowEdge[]
  readOnly?: boolean
}

function WorkflowCanvasInner({ readOnly }: WorkflowCanvasProps) {
  const [nodes] = useAtom(nodesAtom)
  const [edges, setEdges] = useAtom(edgesAtom)
  const onNodesChange = useSetAtom(onNodesChangeAtom)
  const onEdgesChange = useSetAtom(onEdgesChangeAtom)
  const setSelectedNode = useSetAtom(selectedNodeAtom)

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds))
    },
    [setEdges],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: WorkflowNode) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
      >
        <Background gap={20} size={1} />
        {!readOnly && <Controls />}
      </ReactFlow>
    </div>
  )
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
