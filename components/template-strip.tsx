'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Template {
  slug: string
  name: string
  description: string | null
  category: string
  icon: string
}

export function TemplateStrip({ onSelect }: { onSelect: (slug: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {})
  }, [])

  if (templates.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-xs text-muted-foreground mb-2">Start from a template</p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {templates.map((t) => (
          <Button
            key={t.slug}
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            onClick={() => onSelect(t.slug)}
          >
            {t.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
