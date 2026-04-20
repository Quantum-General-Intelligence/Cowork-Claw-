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
    const { operation, sourceFile, targetPath } = body

    if (!operation || !sourceFile) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    const sandbox = envResolved.instance
    const workdir = envResolved.workdir

    const sourceBasename = sourceFile.split('/').pop()
    const targetFile = targetPath ? `${targetPath}/${sourceBasename}` : sourceBasename

    if (operation === 'copy') {
      const copyResult = await sandbox.runCommand({
        cmd: 'cp',
        args: ['-r', sourceFile, targetFile],
        cwd: workdir,
      })
      if (copyResult.exitCode !== 0) {
        const stderr = await copyResult.stderr()
        console.error('Failed to copy file:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to copy file' }, { status: 500 })
      }
      return NextResponse.json({ success: true, message: 'File copied successfully' })
    } else if (operation === 'cut') {
      const mvResult = await sandbox.runCommand({
        cmd: 'mv',
        args: [sourceFile, targetFile],
        cwd: workdir,
      })
      if (mvResult.exitCode !== 0) {
        const stderr = await mvResult.stderr()
        console.error('Failed to move file:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to move file' }, { status: 500 })
      }
      return NextResponse.json({ success: true, message: 'File moved successfully' })
    } else {
      return NextResponse.json({ success: false, error: 'Invalid operation' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error performing file operation:', error)
    return NextResponse.json({ success: false, error: 'Failed to perform file operation' }, { status: 500 })
  }
}
