import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
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

    const statusResult = await sandbox.runCommand({ cmd: 'git', args: ['status', '--porcelain'], cwd: workdir })
    if (statusResult.exitCode !== 0) {
      const stderr = await statusResult.stderr()
      console.error('Failed to check status:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to check status' }, { status: 500 })
    }

    const statusOutput = await statusResult.stdout()
    const hasChanges = statusOutput.trim().length > 0

    if (hasChanges) {
      const addResult = await sandbox.runCommand({ cmd: 'git', args: ['add', '.'], cwd: workdir })
      if (addResult.exitCode !== 0) {
        const stderr = await addResult.stderr()
        console.error('Failed to add changes:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to add changes' }, { status: 500 })
      }

      const message = commitMessage || 'Checkpoint before reset'
      const commitResult = await sandbox.runCommand({
        cmd: 'git',
        args: ['commit', '-m', message],
        cwd: workdir,
      })
      if (commitResult.exitCode !== 0) {
        const stderr = await commitResult.stderr()
        console.error('Failed to commit changes:', stderr)
        return NextResponse.json({ success: false, error: 'Failed to commit changes' }, { status: 500 })
      }
    }

    const lsRemoteResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['ls-remote', '--heads', 'origin', task.branchName],
      cwd: workdir,
    })

    let resetTarget: string
    if (lsRemoteResult.exitCode === 0) {
      const lsRemoteOutput = await lsRemoteResult.stdout()
      const remoteBranchExists = lsRemoteOutput.trim().length > 0

      if (remoteBranchExists) {
        const fetchResult = await sandbox.runCommand({
          cmd: 'git',
          args: ['fetch', 'origin', task.branchName],
          cwd: workdir,
        })

        if (fetchResult.exitCode !== 0) {
          const stderr = await fetchResult.stderr()
          console.error('Failed to fetch from remote:', stderr)
          return NextResponse.json({ success: false, error: 'Failed to fetch from remote' }, { status: 500 })
        }

        resetTarget = 'FETCH_HEAD'
      } else {
        resetTarget = 'HEAD'
      }
    } else {
      resetTarget = 'HEAD'
    }

    const resetResult = await sandbox.runCommand({
      cmd: 'git',
      args: ['reset', '--hard', resetTarget],
      cwd: workdir,
    })
    if (resetResult.exitCode !== 0) {
      const stderr = await resetResult.stderr()
      console.error('Failed to reset:', stderr)
      return NextResponse.json({ success: false, error: 'Failed to reset changes' }, { status: 500 })
    }

    const cleanResult = await sandbox.runCommand({ cmd: 'git', args: ['clean', '-fd'], cwd: workdir })
    if (cleanResult.exitCode !== 0) {
      const stderr = await cleanResult.stderr()
      console.error('Failed to clean:', stderr)
    }

    return NextResponse.json({
      success: true,
      message: 'Changes reset successfully to match remote branch',
      hadLocalChanges: hasChanges,
    })
  } catch (error) {
    console.error('Error resetting changes:', error)
    return NextResponse.json({ success: false, error: 'An error occurred while resetting changes' }, { status: 500 })
  }
}
