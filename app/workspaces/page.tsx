import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workspaces - Cowork-Claw',
}

export default async function WorkspacesPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  return (
    <div className="flex-1 bg-background p-6">
      <h1 className="text-lg font-semibold mb-4">Workspaces</h1>
      <p className="text-sm text-muted-foreground">
        Manage your team workspaces from the workspace switcher in the header.
      </p>
    </div>
  )
}
