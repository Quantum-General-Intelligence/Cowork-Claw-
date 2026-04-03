'use client'

import { useState, useEffect } from 'react'
import { SharedHeader } from '@/components/shared-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Workflow, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Session } from '@/lib/session/types'

interface WorkflowItem {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

interface WorkflowsListClientProps {
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
}

export function WorkflowsListClient({ initialStars }: WorkflowsListClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/workflows')
      .then((res) => res.json())
      .then((data) => setWorkflows(data.workflows || []))
      .catch(() => setWorkflows([]))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Workflow' }),
    })
    const data = await res.json()
    if (data.workflow) {
      router.push(`/workflows/${data.workflow.id}`)
    }
  }

  const headerLeftActions = (
    <div className="flex items-center gap-2">
      <h1 className="text-lg font-semibold">Workflows</h1>
    </div>
  )

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <SharedHeader leftActions={headerLeftActions} initialStars={initialStars} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Visual agent orchestration plans</p>
            <Button size="sm" onClick={handleCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Workflow
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : workflows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Workflow className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No workflows yet</p>
                <Button size="sm" onClick={handleCreate} variant="outline" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Create your first workflow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {workflows.map((wf) => (
                <Link key={wf.id} href={`/workflows/${wf.id}`}>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors p-0">
                    <CardContent className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Workflow className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium truncate">{wf.name}</h3>
                          {wf.description && <p className="text-xs text-muted-foreground truncate">{wf.description}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(wf.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
