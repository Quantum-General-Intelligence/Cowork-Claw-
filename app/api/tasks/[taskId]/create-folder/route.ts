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
    const { foldername } = body

    if (!foldername || typeof foldername !== 'string') {
      return NextResponse.json({ success: false, error: 'Foldername is required' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    const mkdirResult = await envResolved.instance.runCommand({
      cmd: 'mkdir',
      args: ['-p', foldername],
      cwd: envResolved.workdir,
    })

    if (mkdirResult.exitCode !== 0) {
      const stderr = await mkdirResult.stderr()
      console.error('Failed to create folder:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to create folder' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Folder created successfully', foldername })
  } catch (error) {
    console.error('Error creating folder:', error)
    return NextResponse.json({ success: false, error: 'An error occurred while creating the folder' }, { status: 500 })
  }
}
