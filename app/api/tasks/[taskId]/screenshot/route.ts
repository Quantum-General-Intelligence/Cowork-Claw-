import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const filePath = request.nextUrl.searchParams.get('path')

    if (!filePath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    // Security: only serve files from /tmp/ directory
    if (!filePath.startsWith('/tmp/')) {
      return NextResponse.json({ error: 'Only /tmp/ files are accessible' }, { status: 403 })
    }

    // Security: validate file extension is an image
    const ext = filePath.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'Only image files are accessible' }, { status: 403 })
    }

    // Security: prevent path traversal
    if (filePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    // Get task and verify ownership
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.sandboxId) {
      return NextResponse.json({ error: 'No active sandbox for this task' }, { status: 400 })
    }

    // Connect to sandbox and read the file as base64
    const { getSandbox } = await import('@/lib/sandbox/sandbox-registry')
    const { Sandbox } = await import('@vercel/sandbox')

    let sandbox = getSandbox(taskId)

    if (!sandbox) {
      const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
      const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
      const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID

      if (sandboxToken && teamId && projectId) {
        sandbox = await Sandbox.get({
          sandboxId: task.sandboxId,
          teamId,
          projectId,
          token: sandboxToken,
        })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ error: 'Could not connect to sandbox' }, { status: 503 })
    }

    // Read file as base64
    const result = await sandbox.runCommand({
      cmd: 'base64',
      args: ['-w', '0', filePath],
    })

    if (result.exitCode !== 0) {
      return NextResponse.json({ error: 'Screenshot file not found' }, { status: 404 })
    }

    const base64Data = await result.stdout()
    const contentType = getContentType(filePath)

    return NextResponse.json({
      success: true,
      data: {
        base64: base64Data.trim(),
        contentType,
        path: filePath,
      },
    })
  } catch (error) {
    console.error('Error serving screenshot:', error)
    return NextResponse.json({ error: 'Failed to serve screenshot' }, { status: 500 })
  }
}
