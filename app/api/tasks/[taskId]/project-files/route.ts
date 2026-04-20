import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getEnvInstanceForTask } from '@/lib/env/resolver'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ error: 'Task environment is not ready' }, { status: 400 })
    }

    // With the LSP integration running inside the env, we no longer need to
    // pre-load all project files into Monaco. The LSP has direct access to
    // all files and node_modules and will handle type resolution on demand.
    return NextResponse.json({
      success: true,
      files: [],
    })
  } catch (error) {
    console.error('Error in project-files API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
