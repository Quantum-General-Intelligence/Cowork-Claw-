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
    const { partial, cwd } = await request.json()

    if (typeof partial !== 'string') {
      return NextResponse.json({ success: false, error: 'Partial text is required' }, { status: 400 })
    }

    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)
    if (!envResolved) {
      return NextResponse.json({ success: false, error: 'Task environment is not ready' }, { status: 400 })
    }

    try {
      const sandbox = envResolved.instance
      const workdir = envResolved.workdir

      const pwdResult = await sandbox.runCommand({ cmd: 'sh', args: ['-c', 'pwd'], cwd: workdir })
      let actualCwd = cwd || workdir
      try {
        const pwdOutput = await pwdResult.stdout()
        if (pwdOutput && pwdOutput.trim()) {
          actualCwd = pwdOutput.trim()
        }
      } catch {
        // use provided cwd or default
      }

      const parts = partial.split(/\s+/)
      const lastPart = parts[parts.length - 1] || ''

      let dir = actualCwd
      let prefix = ''

      if (lastPart.includes('/')) {
        const lastSlash = lastPart.lastIndexOf('/')
        const pathPart = lastPart.substring(0, lastSlash + 1)
        prefix = lastPart.substring(lastSlash + 1)

        if (pathPart.startsWith('/')) {
          dir = pathPart
        } else if (pathPart.startsWith('~/')) {
          dir = `$HOME/${pathPart.substring(2)}`
        } else {
          dir = `${actualCwd}/${pathPart}`
        }
      } else {
        prefix = lastPart
      }

      const escapedDir = "'" + dir.replace(/'/g, "'\\''") + "'"
      const lsCommand = `cd ${escapedDir} 2>/dev/null && ls -1ap 2>/dev/null || echo ""`
      const result = await sandbox.runCommand({ cmd: 'sh', args: ['-c', lsCommand] })

      let stdout = ''
      try {
        stdout = await result.stdout()
      } catch {
        // ignore
      }

      if (!stdout) {
        return NextResponse.json({ success: true, data: { completions: [] } })
      }

      const files = stdout
        .trim()
        .split('\n')
        .filter((f) => f && f.toLowerCase().startsWith(prefix.toLowerCase()))
        .map((f) => ({ name: f, isDirectory: f.endsWith('/') }))

      return NextResponse.json({ success: true, data: { completions: files, prefix } })
    } catch (error) {
      console.error('Error getting completions:', error)
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get completions' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in autocomplete endpoint:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
