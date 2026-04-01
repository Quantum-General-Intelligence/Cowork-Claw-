'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ModuleInfo } from '@/lib/modules/registry'
import { Server, Globe, Layers, Workflow, Check, ExternalLink, Tag } from 'lucide-react'

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

interface ModuleOverviewProps {
  module: ModuleInfo
}

export function ModuleOverview({ module }: ModuleOverviewProps) {
  const Icon = MODULE_ICONS[module.icon]

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header card */}
      <Card className="p-0">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-muted p-3">
              <Icon className="h-6 w-6 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold">{module.name}</h2>
                <Badge variant={STATUS_VARIANT[module.status]} className="text-[10px]">
                  {module.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{module.description}</p>

              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {module.tags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded px-2 py-0.5"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {module.features.map((feature) => (
            <Card key={feature} className="p-0">
              <CardContent className="px-4 py-3 flex items-center gap-3">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <a href={module.repoUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            View Source
          </a>
        </Button>
      </div>
    </div>
  )
}
