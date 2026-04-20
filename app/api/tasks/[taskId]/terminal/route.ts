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
    const { command } = await request.json()

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ success: false, error: 'Command is required' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    try {
      const result = await envResolved.instance.runCommand({
        cmd: 'sh',
        args: ['-c', command],
        cwd: envResolved.workdir,
      })

      let stdout = ''
      let stderr = ''
      try {
        stdout = await result.stdout()
      } catch {
        // ignore
      }
      try {
        stderr = await result.stderr()
      } catch {
        // ignore
      }

      return NextResponse.json({
        success: true,
        data: { exitCode: result.exitCode, stdout, stderr },
      })
    } catch (error) {
      console.error('Error executing command:', error)
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Command execution failed',
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in terminal endpoint:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
