import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getEnvInstanceForTask } from '@/lib/env/resolver'

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

    if (!filePath.startsWith('/tmp/')) {
      return NextResponse.json({ error: 'Only /tmp/ files are accessible' }, { status: 403 })
    }

    const ext = filePath.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'Only image files are accessible' }, { status: 403 })
    }

    if (filePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ error: 'Task environment is not ready' }, { status: 400 })
    }

    const result = await envResolved.instance.runCommand({
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
