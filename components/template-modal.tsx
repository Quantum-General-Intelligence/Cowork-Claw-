'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ParamField {
  type: string
  label: string
  required: boolean
}

interface Template {
  slug: string
  name: string
  description: string | null
  defaultPrompt: string
  paramsSchema: Record<string, ParamField>
}

interface TemplateModalProps {
  slug: string | null
  onClose: () => void
  onSubmit: (renderedPrompt: string, templateSlug: string) => void
}

function isLongTextParam(key: string, field: ParamField): boolean {
  const lowerKey = key.toLowerCase()
  const lowerLabel = field.label.toLowerCase()
  return (
    lowerKey.length > 20 ||
    lowerKey === 'content' ||
    lowerKey === 'emails' ||
    lowerKey === 'scope' ||
    lowerLabel.includes('paste') ||
    lowerLabel.includes('content')
  )
}

export function TemplateModal({ slug, onClose, onSubmit }: TemplateModalProps) {
  const [template, setTemplate] = useState<Template | null>(null)
  const [params, setParams] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setTemplate(null)
    setParams({})
    fetch(`/api/templates/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setTemplate(data.template)
        const initial: Record<string, string> = {}
        if (data.template?.paramsSchema) {
          for (const key of Object.keys(data.template.paramsSchema)) {
            initial[key] = ''
          }
        }
        setParams(initial)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  if (!slug) return null

  const handleSubmit = () => {
    if (!template) return
    let rendered = template.defaultPrompt
    for (const [key, value] of Object.entries(params)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `[${key}]`)
    }
    onSubmit(rendered, template.slug)
    onClose()
  }

  const schema = template?.paramsSchema || {}
  const requiredFields = Object.entries(schema).filter(([, f]) => f.required)
  const allRequiredFilled = requiredFields.every(([key]) => params[key]?.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
        style={{ borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading template...</p>
        ) : template ? (
          <>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--color-headline)' }}>
              {template.name}
            </h3>
            {template.description && (
              <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
            )}
            <div className="mt-4 space-y-3">
              {Object.entries(schema).map(([key, field]) => (
                <div key={key}>
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {isLongTextParam(key, field) ? (
                    <textarea
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      rows={4}
                      value={params[key] || ''}
                      onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={field.label}
                    />
                  ) : (
                    <Input
                      className="mt-1"
                      value={params[key] || ''}
                      onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={field.label}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!allRequiredFilled}>
                Start Task
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">Template not found</p>
        )}
      </div>
    </div>
  )
}
