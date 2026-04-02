'use client'

import { useState, useEffect } from 'react'
import { Loader2, ImageIcon } from 'lucide-react'

// Match patterns like: "Screenshot saved to /tmp/screenshot-xxx.png"
// or "/tmp/screenshot-2026-02-17T12-00-00-abc123.png"
const SCREENSHOT_PATH_REGEX = /\/tmp\/[^\s"']+\.(?:png|jpg|jpeg|webp)/gi

interface BrowserScreenshotProps {
  taskId: string
  content: string
}

export function extractScreenshotPaths(content: string): string[] {
  const matches = content.match(SCREENSHOT_PATH_REGEX)
  if (!matches) return []
  // Deduplicate
  return [...new Set(matches)]
}

function ScreenshotImage({ taskId, path }: { taskId: string; path: string }) {
  const [imageData, setImageData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchScreenshot() {
      try {
        const response = await fetch(`/api/tasks/${taskId}/screenshot?path=${encodeURIComponent(path)}`)
        if (!response.ok) {
          setError(true)
          return
        }
        const data = await response.json()
        if (!cancelled && data.success) {
          setImageData(`data:${data.data.contentType};base64,${data.data.base64}`)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchScreenshot()
    return () => {
      cancelled = true
    }
  }, [taskId, path])

  if (error) return null

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading screenshot...</span>
      </div>
    )
  }

  if (!imageData) return null

  const filename = path.split('/').pop() || 'screenshot'

  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <ImageIcon className="h-3 w-3" />
        <span>{filename}</span>
      </div>
      <img
        src={imageData}
        alt={`Screenshot: ${filename}`}
        className="rounded border border-border max-w-full max-h-[300px] object-contain"
      />
    </div>
  )
}

export function BrowserScreenshots({ taskId, content }: BrowserScreenshotProps) {
  const paths = extractScreenshotPaths(content)
  if (paths.length === 0) return null

  return (
    <div className="space-y-2">
      {paths.map((path) => (
        <ScreenshotImage key={path} taskId={taskId} path={path} />
      ))}
    </div>
  )
}
