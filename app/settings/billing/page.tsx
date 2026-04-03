import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Billing - Cowork-Claw',
}

export default async function BillingPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  return (
    <div className="flex-1 bg-background p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Billing & Usage</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your subscription and view usage statistics.</p>

      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-2">Current Plan</h2>
          <p className="text-2xl font-bold">Free</p>
          <p className="text-xs text-muted-foreground mt-1">5 tasks/day, 60 sandbox minutes/month</p>
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-2">Usage Today</h2>
          <p className="text-xs text-muted-foreground">Usage tracking active when database is connected.</p>
        </div>
      </div>
    </div>
  )
}
