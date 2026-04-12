import { db } from '@/lib/db/client'
import { taskArtifacts } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import type { SandboxInstance } from '@/lib/sandbox/provider'

export async function registerArtifacts(
  sandbox: SandboxInstance,
  taskId: string,
  userId: string,
): Promise<number> {
  try {
    const result = await sandbox.runCommand('find', [
      '/out',
      '-maxdepth',
      '1',
      '-type',
      'f',
      '-not',
      '-name',
      'progress.log',
    ])
    const stdout = await result.stdout()
    const files = stdout.trim().split('\n').filter(Boolean)

    let count = 0
    for (const filePath of files) {
      const filename = filePath.split('/').pop() || 'unknown'
      const mime = guessMime(filename)

      // Get file size
      let size = 0
      try {
        const sizeResult = await sandbox.runCommand('stat', ['--format=%s', filePath])
        const sizeStr = await sizeResult.stdout()
        size = parseInt(sizeStr.trim(), 10) || 0
      } catch {
        // ignore
      }

      await db.insert(taskArtifacts).values({
        id: generateId(12),
        taskId,
        userId,
        filename,
        mime,
        size,
        path: filePath,
      })
      count++
    }
    return count
  } catch {
    return 0
  }
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimes: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    pdf: 'application/pdf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
  }
  return mimes[ext || ''] || 'application/octet-stream'
}
