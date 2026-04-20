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

    if (!filename) {
      return NextResponse.json({ success: false, error: 'Missing filename parameter' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    const lsFilesResult = await envResolved.instance.runCommand({
      cmd: 'git',
      args: ['ls-files', filename],
      cwd: envResolved.workdir,
    })
    const isTracked = (await lsFilesResult.stdout()).trim().length > 0

    if (isTracked) {
      const checkoutResult = await envResolved.instance.runCommand({
        cmd: 'git',
        args: ['checkout', 'HEAD', '--', filename],
        cwd: envResolved.workdir,
      })
      if (checkoutResult.exitCode !== 0) {
        const stderr = await checkoutResult.stderr()
        console.error('Failed to discard changes:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to discard changes' }, { status: 500 })
      }
    } else {
      const rmResult = await envResolved.instance.runCommand({
        cmd: 'rm',
        args: [filename],
        cwd: envResolved.workdir,
      })
      if (rmResult.exitCode !== 0) {
        const stderr = await rmResult.stderr()
        console.error('Failed to delete file:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to delete file' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: isTracked ? 'Changes discarded successfully' : 'New file deleted successfully',
    })
  } catch (error) {
    console.error('Error discarding file changes:', error)
    return NextResponse.json({ success: false, error: 'An error occurred while discarding changes' }, { status: 500 })
  }
}
