import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOctokit } from '@/lib/github/client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getEnvInstanceForTask } from '@/lib/env/resolver'
import type { Octokit } from '@octokit/rest'

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const langMap: { [key: string]: string } = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    sql: 'sql',
  }
  return langMap[ext || ''] || 'text'
}

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif']
  return imageExtensions.includes(ext || '')
}

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const binaryExtensions = [
    'zip',
    'tar',
    'gz',
    'rar',
    '7z',
    'bz2',
    'exe',
    'dll',
    'so',
    'dylib',
    'db',
    'sqlite',
    'sqlite3',
    'mp3',
    'mp4',
    'avi',
    'mov',
    'wav',
    'flac',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'ttf',
    'otf',
    'woff',
    'woff2',
    'eot',
    'bin',
    'dat',
    'dmg',
    'iso',
    'img',
  ]
  return binaryExtensions.includes(ext || '') || isImageFile(filename)
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  isImage: boolean,
): Promise<{ content: string; isBase64: boolean }> {
  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path, ref })

    if ('content' in response.data && typeof response.data.content === 'string') {
      if (isImage) {
        return { content: response.data.content, isBase64: true }
      }
      return {
        content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
        isBase64: false,
      }
    }
    return { content: '', isBase64: false }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return { content: '', isBase64: false }
    }
    throw error
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const searchParams = request.nextUrl.searchParams
    const rawFilename = searchParams.get('filename')
    const mode = searchParams.get('mode') || 'remote'

    if (!rawFilename) {
      return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 })
    }

    const filename = decodeURIComponent(rawFilename)

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.branchName || !task.repoUrl) {
      return NextResponse.json({ error: 'Task does not have branch or repository information' }, { status: 400 })
    }

    const octokit = await getOctokit()
    if (!octokit.auth) {
      return NextResponse.json(
        { error: 'GitHub authentication required. Please connect your GitHub account to view files.' },
        { status: 401 },
      )
    }

    const githubMatch = task.repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/)
    if (!githubMatch) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
    }

    const [, owner, repo] = githubMatch

    const isImage = isImageFile(filename)
    const isBinary = isBinaryFile(filename)

    if (isBinary && !isImage) {
      return NextResponse.json({
        success: true,
        data: {
          filename,
          oldContent: '',
          newContent: '',
          language: 'text',
          isBinary: true,
          isImage: false,
        },
      })
    }

    const isNodeModulesFile = filename.includes('/node_modules/')
    const envResolved = await getEnvInstanceForTask(taskId, session.user.id)

    async function readFromEnv(): Promise<string | null> {
      if (!envResolved) return null
      const normalizedPath = filename.startsWith('/') ? filename.substring(1) : filename
      const catResult = await envResolved.instance.runCommand({
        cmd: 'cat',
        args: [normalizedPath],
        cwd: envResolved.workdir,
      })
      if (catResult.exitCode !== 0) return null
      return await catResult.stdout()
    }

    let oldContent = ''
    let newContent = ''
    let isBase64 = false
    let fileFound = false

    if (mode === 'local') {
      if (!isNodeModulesFile) {
        const remoteResult = await getFileContent(octokit, owner, repo, filename, task.branchName, isImage)
        oldContent = remoteResult.content
        isBase64 = remoteResult.isBase64
      }

      const envContent = await readFromEnv()
      if (envContent !== null) {
        newContent = envContent
        fileFound = true
      }

      if (!fileFound) {
        return NextResponse.json({ error: 'File not found in environment' }, { status: 404 })
      }
    } else {
      let content = ''

      if (isNodeModulesFile) {
        const envContent = await readFromEnv()
        if (envContent !== null) {
          content = envContent
          fileFound = true
        }
      } else {
        const result = await getFileContent(octokit, owner, repo, filename, task.branchName, isImage)
        content = result.content
        isBase64 = result.isBase64
        if (content || isImage) fileFound = true
      }

      if (!fileFound && !isImage && !isNodeModulesFile) {
        const envContent = await readFromEnv()
        if (envContent !== null) {
          content = envContent
          fileFound = true
        }
      }

      if (!fileFound && !isImage) {
        return NextResponse.json({ error: 'File not found in branch' }, { status: 404 })
      }

      oldContent = ''
      newContent = content
    }

    return NextResponse.json({
      success: true,
      data: {
        filename,
        oldContent,
        newContent,
        language: getLanguageFromFilename(filename),
        isBinary: false,
        isImage,
        isBase64,
      },
    })
  } catch (error) {
    console.error('Error in file-content API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
