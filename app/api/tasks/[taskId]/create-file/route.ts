import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getEnvInstanceForTask } from '@/lib/env/resolver'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()
    const { filename } = body

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ success: false, error: 'Filename is required' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    const pathParts = filename.split('/')
    if (pathParts.length > 1) {
      const dirPath = pathParts.slice(0, -1).join('/')
      const mkdirResult = await envResolved.instance.runCommand({
        cmd: 'mkdir',
        args: ['-p', dirPath],
        cwd: envResolved.workdir,
      })
      if (mkdirResult.exitCode !== 0) {
        const stderr = await mkdirResult.stderr()
        console.error('Failed to create parent directories:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to create parent directories' }, { status: 500 })
      }
    }

    const touchResult = await envResolved.instance.runCommand({
      cmd: 'touch',
      args: [filename],
      cwd: envResolved.workdir,
    })

    if (touchResult.exitCode !== 0) {
      const stderr = await touchResult.stderr()
      console.error('Failed to create file:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to create file' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'File created successfully', filename })
  } catch (error) {
    console.error('Error creating file:', error)
    return NextResponse.json({ success: false, error: 'An error occurred while creating the file' }, { status: 500 })
  }
}
