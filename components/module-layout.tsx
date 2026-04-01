'use client'

import { SharedHeader } from '@/components/shared-header'
import type { ModuleInfo } from '@/lib/modules/registry'
import type { Session } from '@/lib/session/types'

interface ModuleLayoutProps {
  module: ModuleInfo
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
  children: React.ReactNode
}

export function ModuleLayout({ module, initialStars, children }: ModuleLayoutProps) {
  const headerLeftActions = (
    <div className="flex items-center gap-2 min-w-0">
      <h1 className="text-lg font-semibold truncate">{module.name}</h1>
    </div>
  )

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <SharedHeader leftActions={headerLeftActions} initialStars={initialStars} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 pb-6">{children}</div>
    </div>
  )
}
