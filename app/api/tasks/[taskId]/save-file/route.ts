import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getEnvInstanceForTask } from '@/lib/env/resolver'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { filename, content } = body

    if (!filename || content === undefined) {
      return NextResponse.json({ error: 'Missing filename or content' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ error: 'Task environment is not ready' }, { status: 400 })
    }

    const escapedFilename = "'" + filename.replace(/'/g, "'\\''") + "'"
    const encodedContent = Buffer.from(content).toString('base64')
    const writeCommand = `echo '${encodedContent}' | base64 -d > ${escapedFilename}`

    const result = await envResolved.instance.runCommand({
      cmd: 'sh',
      args: ['-c', writeCommand],
      cwd: envResolved.workdir,
    })

    if (result.exitCode !== 0) {
      let stderr = ''
      try {
        stderr = await result.stderr()
      } catch {
        // ignore
      }
      console.error('Failed to write file, stderr:', stderr)
      return NextResponse.json({ error: 'Failed to write file to environment' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'File saved successfully' })
  } catch (error) {
    console.error('Error in save-file API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
