import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings - Cowork-Claw',
}

export default async function SettingsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  return (
    <div className="flex-1 bg-background p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold mb-6">Settings</h1>

      <div className="space-y-2">
        <Link href="/settings/billing" className="block border rounded-lg p-4 hover:bg-accent/50 transition-colors">
          <h2 className="text-sm font-medium">Billing & Usage</h2>
          <p className="text-xs text-muted-foreground mt-1">Manage subscription, view usage stats</p>
        </Link>
      </div>
    </div>
  )
}
