import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getEnvInstanceForTask } from '@/lib/env/resolver'

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json().catch(() => ({}))
    const { commitMessage } = body

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    if (!task.branchName) {
      return NextResponse.json({ success: false, error: 'Branch not available' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    const sandbox = envResolved.instance
    const workdir = envResolved.workdir

    const addResult = await sandbox.runCommand({ cmd: 'git', args: ['add', '.'], cwd: workdir })
    if (addResult.exitCode !== 0) {
      const stderr = await addResult.stderr()
      console.error('Failed to add changes:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to add changes' }, { status: 500 })
    }

    const statusResult = await sandbox.runCommand({ cmd: 'git', args: ['status', '--porcelain'], cwd: workdir })
    if (statusResult.exitCode !== 0) {
      const stderr = await statusResult.stderr()
      console.error('Failed to check status:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to check status' }, { status: 500 })
    }

    const statusOutput = await statusResult.stdout()
    const hasChanges = statusOutput.trim().length > 0
    if (!hasChanges) {
      return NextResponse.json({
        success: true,
        message: 'No changes to sync',
        committed: false,
        pushed: false,
      })
    }

    const message = commitMessage || 'Sync local changes'
    const commitResult = await sandbox.runCommand({ cmd: 'git', args: ['commit', '-m', message], cwd: workdir })
    if (commitResult.exitCode !== 0) {
      const stderr = await commitResult.stderr()
      console.error('Failed to commit changes:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to commit changes' }, { status: 500 })
    }

    const pushResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['push', 'origin', task.branchName],
      cwd: workdir,
    })
    if (pushResult.exitCode !== 0) {
      const stderr = await pushResult.stderr()
      console.error('Failed to push changes:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to push changes' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Changes synced successfully',
      committed: true,
      pushed: true,
    })
  } catch (error) {
    console.error('Error syncing changes:', error)
    return NextResponse.json({ success: false, error: 'An error occurred while syncing changes' }, { status: 500 })
  }
}
