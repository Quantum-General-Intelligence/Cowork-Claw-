'use client'

import { SharedHeader } from '@/components/shared-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MODULES, type ModuleInfo } from '@/lib/modules/registry'
import { Server, Globe, Layers, Workflow, ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import type { Session } from '@/lib/session/types'

const MODULE_ICONS: Record<ModuleInfo['icon'], React.ComponentType<{ className?: string }>> = {
  Server,
  Globe,
  Layers,
  Workflow,
}

const STATUS_VARIANT: Record<ModuleInfo['status'], 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  preview: 'secondary',
  experimental: 'outline',
}

interface ModulesHubProps {
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
}

export function ModulesHub({ initialStars }: ModulesHubProps) {
  const headerLeftActions = (
    <div className="flex items-center gap-2 min-w-0">
      <h1 className="text-lg font-semibold">Modules</h1>
    </div>
  )

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <SharedHeader leftActions={headerLeftActions} initialStars={initialStars} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 pb-6">
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
          Integrated modules extending the platform with browser automation, generative UI, visual workflows, and AI
          agent runtime management.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {MODULES.map((mod) => {
            const Icon = MODULE_ICONS[mod.icon]
            return (
              <Link key={mod.slug} href={`/modules/${mod.slug}`} className="group">
                <Card className="h-full transition-colors hover:bg-accent/50 p-0">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <Icon className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <h2 className="text-sm font-semibold">{mod.name}</h2>
                          <p className="text-xs text-muted-foreground">{mod.shortDescription}</p>
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANT[mod.status]} className="text-[10px]">
                        {mod.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{mod.description}</p>

                    <div className="space-y-1.5 mb-4">
                      {mod.features.slice(0, 4).map((feature) => (
                        <div key={feature} className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium group-hover:underline">View Details</span>
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
