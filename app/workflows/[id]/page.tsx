import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import { WorkflowEditorClient } from '@/components/workflow-editor-client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workflow Editor - Cowork-Claw',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function WorkflowEditorPage({ params }: PageProps) {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const { id } = await params

  return <WorkflowEditorClient workflowId={id} />
}
