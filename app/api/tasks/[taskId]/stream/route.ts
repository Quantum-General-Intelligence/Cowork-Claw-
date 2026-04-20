import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks, userEnvironments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { execAsUser } from '@/lib/company/vps-client'

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
          const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
          if (!task) {
            send('error', 'Task not found')
            break
          }

          if (['completed', 'error', 'stopped'].includes(task.status)) {
            send('status', task.status)
            break
          }

          // Prefer persistent-env path: cat progress.log inside the user's workdir.
          if (task.environmentId && task.workdir) {
            try {
              const [env] = await db
                .select()
                .from(userEnvironments)
                .where(eq(userEnvironments.id, task.environmentId))
                .limit(1)
              if (env) {
                const progressPath = `${task.workdir}/.out/progress.log`
                const result = await execAsUser(
                  env.linuxUsername,
                  `cat '${progressPath.replace(/'/g, "'\\''")}' 2>/dev/null || true`,
                  { timeoutMs: 10000, maxRetries: 1 },
                )
                if (result.exitCode === 0) {
                  const content = result.stdout
                  if (content.length > lastLength) {
                    const newContent = content.substring(lastLength)
                    send('progress', newContent)
                    lastLength = content.length
                  }
                }
              }
            } catch {
              // env may not be ready; keep polling
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
