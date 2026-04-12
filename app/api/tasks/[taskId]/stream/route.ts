import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSandboxProvider } from '@/lib/sandbox/factory'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{
    taskId: string
  }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { taskId } = await params

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let lastLength = 0
      let attempts = 0
      const MAX_ATTEMPTS = 600 // 20 min at 2s intervals

      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      while (attempts < MAX_ATTEMPTS) {
        attempts++
        try {
          // Check task status
          const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
          if (!task) {
            send('error', 'Task not found')
            break
          }

          if (['completed', 'error', 'stopped'].includes(task.status)) {
            send('status', task.status)
            break
          }

          // Try to read progress log from sandbox
          if (task.sandboxId) {
            try {
              const provider = getSandboxProvider()
              const sandbox = await provider.get({ sandboxId: task.sandboxId })
              const result = await sandbox.runCommand('cat', ['/out/progress.log'])
              const content = await result.stdout()

              if (content.length > lastLength) {
                const newContent = content.substring(lastLength)
                send('progress', newContent)
                lastLength = content.length
              }
            } catch {
              // Sandbox may not be ready yet or may have exited
            }
          }
        } catch {
          // DB error, keep trying
        }

        await new Promise((r) => setTimeout(r, 2000))
      }

      send('done', 'stream ended')
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
