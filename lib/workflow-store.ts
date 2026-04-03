import { atom } from 'jotai'
import type { Node, Edge, OnNodesChange, OnEdgesChange } from '@xyflow/react'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'

export interface AgentNodeData {
  agent: string
  prompt: string
  status: 'pending' | 'running' | 'done' | 'error'
  taskId?: string
  error?: string
  [key: string]: unknown
}

export type WorkflowNode = Node<AgentNodeData>
export type WorkflowEdge = Edge

// Core state
export const nodesAtom = atom<WorkflowNode[]>([])
export const edgesAtom = atom<WorkflowEdge[]>([])
export const selectedNodeAtom = atom<string | null>(null)
export const isExecutingAtom = atom(false)
export const currentWorkflowIdAtom = atom<string | null>(null)
export const currentWorkflowNameAtom = atom('Untitled Workflow')

// Node/edge change handlers
export const onNodesChangeAtom = atom(null, (get, set, changes: Parameters<OnNodesChange>[0]) => {
  set(nodesAtom, applyNodeChanges(changes, get(nodesAtom)) as WorkflowNode[])
})

export const onEdgesChangeAtom = atom(null, (get, set, changes: Parameters<OnEdgesChange>[0]) => {
  set(edgesAtom, applyEdgeChanges(changes, get(edgesAtom)))
})

// Generate workflow from orchestrator plan
export function planToWorkflow(plan: { agent: string; description: string }[]): {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
} {
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger',
      type: 'trigger',
      position: { x: 250, y: 0 },
      data: { agent: 'start', prompt: 'Start', status: 'done' as const },
    },
  ]

  const edges: WorkflowEdge[] = []

  plan.forEach((task, i) => {
    const nodeId = `agent-${i}`
    nodes.push({
      id: nodeId,
      type: 'agent',
      position: { x: 250, y: (i + 1) * 150 },
      data: {
        agent: task.agent,
        prompt: task.description,
        status: 'pending' as const,
      },
    })

    const sourceId = i === 0 ? 'trigger' : `agent-${i - 1}`
    edges.push({
      id: `edge-${sourceId}-${nodeId}`,
      source: sourceId,
      target: nodeId,
      animated: true,
    })
  })

  return { nodes, edges }
}
