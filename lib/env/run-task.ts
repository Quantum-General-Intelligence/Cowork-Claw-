import 'server-only'

import { db } from '@/lib/db/client'
import { userEnvironments, workspaces, workspaceMembers, tasks as tasksTable } from '@/lib/db/schema'
import type { UserEnvironment } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { provisionUserEnv } from '@/lib/company/provision-user'
import { execAsUser, execAsRoot, shellEscapeSingleQuoted } from '@/lib/company/vps-client'
import { TaskLogger } from '@/lib/utils/task-logger'
import { UserEnvInstance } from './user-env-instance'

export interface EnvTaskPrepareResult {
  success: boolean
  error?: string
  instance?: UserEnvInstance
  environment?: UserEnvironment
  workdir?: string
  branchName?: string
  cancelled?: boolean
}

function shellQuote(s: string) {
  return `'${shellEscapeSingleQuoted(s)}'`
}

/**
 * Resolve which workspace a task belongs to. For now: the user's most-recently
 * active persistent-env workspace. Phase C will let the task creator pick.
 */
async function resolveWorkspaceForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      usePersistentEnv: workspaces.usePersistentEnv,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))

  const enabled = rows.find((r) => r.usePersistentEnv)
  return enabled?.workspaceId ?? null
}

/**
 * Determine whether a task should run in the persistent-env pipeline.
 * True iff the task's owner has at least one workspace membership with
 * `workspaces.use_persistent_env = true`.
 */
export async function shouldUsePersistentEnv(userId: string): Promise<boolean> {
  const wsId = await resolveWorkspaceForUser(userId)
  return Boolean(wsId)
}

/**
 * Parse a GitHub repo URL into { owner, repo }. Returns null if the URL isn't
 * a recognizable GitHub HTTPS or SSH URL.
 */
function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    // Handle git@github.com:owner/repo.git
    const sshMatch = repoUrl.match(/^git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/)
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] }
    }
    const u = new URL(repoUrl)
    const parts = u.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    return null
  }
}

/**
 * Build an `https://x-access-token:TOKEN@github.com/owner/repo.git` URL so the
 * inner git clone / fetch can authenticate without any git credential helper.
 */
function authedGithubUrl(owner: string, repo: string, token: string | null | undefined): string {
  if (!token) return `https://github.com/${owner}/${repo}.git`
  const safeToken = encodeURIComponent(token)
  return `https://x-access-token:${safeToken}@github.com/${owner}/${repo}.git`
}

async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1)
    return row?.status === 'stopped'
  } catch {
    return false
  }
}

/**
 * Ensure the user has a ready environment on the VPS. Provisions if missing.
 */
async function ensureEnv(userId: string, workspaceId: string, logger: TaskLogger): Promise<UserEnvironment> {
  const [existing] = await db
    .select()
    .from(userEnvironments)
    .where(and(eq(userEnvironments.userId, userId), eq(userEnvironments.workspaceId, workspaceId)))
    .limit(1)

  if (existing?.status === 'ready') return existing

  await logger.info('Preparing your VPS environment')
  return provisionUserEnv({ userId, workspaceId })
}

/**
 * Prepare the task workdir inside the user's home:
 *   - Coding task: clone/refresh ~/projects/<owner>/<repo>, checkout new branch
 *   - Non-coding task: create fresh ~/tasks/<taskId>
 * Returns the absolute path.
 */
async function prepareWorkdir(params: {
  env: UserEnvironment
  taskId: string
  repoUrl: string | null
  branchName: string | null
  githubToken: string | null | undefined
  gitAuthorName: string
  gitAuthorEmail: string
  logger: TaskLogger
}): Promise<{ workdir: string; branchName: string | null }> {
  const { env, taskId, repoUrl, branchName, githubToken, gitAuthorName, gitAuthorEmail, logger } = params
  const user = env.linuxUsername

  if (repoUrl) {
    const parsed = parseRepoUrl(repoUrl)
    if (!parsed) throw new Error('unsupported repo url')

    const ownerRepoDir = `${env.homeDir}/projects/${parsed.owner}/${parsed.repo}`
    await logger.info('Syncing repository')

    // Ensure the parent owner directory exists (as the user).
    const parentDir = `${env.homeDir}/projects/${parsed.owner}`
    await execAsUser(user, `mkdir -p ${shellQuote(parentDir)}`, { timeoutMs: 10000 })

    // Clone if absent; otherwise `git fetch origin` to refresh.
    const cloneUrl = authedGithubUrl(parsed.owner, parsed.repo, githubToken)
    const cloneOrFetch = [
      `if [ ! -d ${shellQuote(ownerRepoDir + '/.git')} ]; then`,
      `  git clone ${shellQuote(cloneUrl)} ${shellQuote(ownerRepoDir)}`,
      `else`,
      // Refresh the remote token in case it rotated.
      `  (cd ${shellQuote(ownerRepoDir)} && git remote set-url origin ${shellQuote(cloneUrl)} && git fetch origin --prune)`,
      `fi`,
    ].join(' ')

    const cloneResult = await execAsUser(user, cloneOrFetch, { timeoutMs: 5 * 60 * 1000, maxRetries: 1 })
    if (cloneResult.exitCode !== 0) {
      throw new Error('failed to sync repository')
    }

    // Configure git identity in this repo (scoped, doesn't pollute global config).
    const identityCmd = [
      `git -C ${shellQuote(ownerRepoDir)} config user.name ${shellQuote(gitAuthorName)}`,
      `git -C ${shellQuote(ownerRepoDir)} config user.email ${shellQuote(gitAuthorEmail)}`,
    ].join(' && ')
    await execAsUser(user, identityCmd, { timeoutMs: 10000 })

    // Determine branch to use.
    let resolvedBranch = branchName ?? `agent/${taskId.slice(0, 8)}`

    // Start from a clean state on the default branch, then cut a new branch.
    const checkoutCmd = [
      `cd ${shellQuote(ownerRepoDir)}`,
      `DEFAULT=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||' || echo main)`,
      // Reset any leftover working-tree changes from prior tasks.
      `git reset --hard HEAD 2>/dev/null || true`,
      `git clean -fd 2>/dev/null || true`,
      `git checkout "$DEFAULT" 2>/dev/null || git checkout -B "$DEFAULT" origin/"$DEFAULT"`,
      `git pull --ff-only origin "$DEFAULT" 2>/dev/null || true`,
      `git checkout -B ${shellQuote(resolvedBranch)}`,
    ].join(' && ')

    const coResult = await execAsUser(user, checkoutCmd, { timeoutMs: 60000 })
    if (coResult.exitCode !== 0) {
      throw new Error('failed to checkout branch')
    }

    // Also create a per-task .out/ inside the workdir for artifacts + logs.
    await execAsUser(user, `mkdir -p ${shellQuote(ownerRepoDir + '/.out')}`, { timeoutMs: 10000 })

    return { workdir: ownerRepoDir, branchName: resolvedBranch }
  }

  // Non-coding task: fresh ~/tasks/<taskId>
  const workdir = `${env.homeDir}/tasks/${taskId}`
  await execAsUser(user, `mkdir -p ${shellQuote(workdir + '/.out')}`, { timeoutMs: 10000 })
  return { workdir, branchName: null }
}

export interface RunInEnvConfig {
  userId: string
  taskId: string
  repoUrl?: string | null
  preDeterminedBranchName?: string | null
  githubToken?: string | null
  gitAuthorName?: string
  gitAuthorEmail?: string
  onCancellationCheck?: () => Promise<boolean>
}

/**
 * Top-level prepare step for a persistent-env task. Returns a UserEnvInstance
 * + workdir that the existing `executeAgentInSandbox` dispatcher can run
 * against without modification.
 *
 * This replaces `createSandbox` for tasks that belong to a workspace with
 * `usePersistentEnv = true`.
 */
export async function prepareEnvTask(config: RunInEnvConfig, logger: TaskLogger): Promise<EnvTaskPrepareResult> {
  try {
    if (await isTaskStopped(config.taskId)) {
      return { success: false, cancelled: true }
    }

    const workspaceId = await resolveWorkspaceForUser(config.userId)
    if (!workspaceId) {
      return { success: false, error: 'No persistent-env workspace' }
    }

    const env = await ensureEnv(config.userId, workspaceId, logger)

    if (config.onCancellationCheck && (await config.onCancellationCheck())) {
      return { success: false, cancelled: true }
    }

    const { workdir, branchName } = await prepareWorkdir({
      env,
      taskId: config.taskId,
      repoUrl: config.repoUrl ?? null,
      branchName: config.preDeterminedBranchName ?? null,
      githubToken: config.githubToken,
      gitAuthorName: config.gitAuthorName ?? 'Coding Agent',
      gitAuthorEmail: config.gitAuthorEmail ?? 'agent@example.com',
      logger,
    })

    await db
      .update(userEnvironments)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(userEnvironments.id, env.id))

    const instance = new UserEnvInstance({
      environmentId: env.id,
      linuxUsername: env.linuxUsername,
      projectDir: workdir,
    })

    return {
      success: true,
      instance,
      environment: env,
      workdir,
      branchName: branchName ?? undefined,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'env task prepare failed'
    console.error('prepareEnvTask error:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Resume an already-prepared env task (follow-up turn). Doesn't re-clone; just
 * re-hydrates the UserEnvInstance from the DB row.
 */
export async function resumeEnvTask(taskId: string): Promise<UserEnvInstance | null> {
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1)
  if (!task?.environmentId || !task?.workdir) return null

  const [env] = await db.select().from(userEnvironments).where(eq(userEnvironments.id, task.environmentId)).limit(1)
  if (!env || env.status !== 'ready') return null

  return new UserEnvInstance({
    environmentId: env.id,
    linuxUsername: env.linuxUsername,
    projectDir: task.workdir,
  })
}

/**
 * Register artifacts from the workdir's .out/ directory into the DB.
 * Replaces the Docker-only `registerArtifacts` path for env tasks.
 */
export async function registerEnvArtifacts(params: {
  instance: UserEnvInstance
  taskId: string
  userId: string
  workdir: string
}): Promise<number> {
  const { instance, taskId, userId, workdir } = params

  // List everything under .out/ except progress.log.
  const findCmd = `find ${shellQuote(workdir + '/.out')} -maxdepth 1 -type f ! -name 'progress.log' 2>/dev/null | sort`
  const listResult = await instance.runCommand('sh', ['-c', findCmd])
  if (listResult.exitCode !== 0) return 0

  const stdout = await listResult.stdout()
  const files = stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  if (files.length === 0) return 0

  const { taskArtifacts } = await import('@/lib/db/schema')
  const { generateId } = await import('@/lib/utils/id')

  let count = 0
  for (const absPath of files) {
    const basename = absPath.split('/').pop() ?? 'artifact'
    const sizeResult = await instance.runCommand('sh', ['-c', `stat -c '%s' ${shellQuote(absPath)}`])
    const sizeStr = (await sizeResult.stdout()).trim()
    const size = parseInt(sizeStr, 10) || 0

    try {
      await db.insert(taskArtifacts).values({
        id: generateId(16),
        taskId,
        userId,
        filename: basename,
        mime: guessMime(basename),
        size,
        path: absPath,
      })
      count++
    } catch (err) {
      console.error('registerEnvArtifacts row insert failed:', err instanceof Error ? err.message : err)
    }
  }
  return count
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimes: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    html: 'text/html',
    pdf: 'application/pdf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
  }
  return mimes[ext || ''] || 'application/octet-stream'
}

/**
 * Ensure a directory exists on the VPS. Helper for ad-hoc pre/post-task hooks.
 */
export async function ensureEnvDirExists(linuxUsername: string, path: string): Promise<void> {
  if (!path.startsWith('/')) throw new Error('path must be absolute')
  await execAsUser(linuxUsername, `mkdir -p ${shellQuote(path)}`, { timeoutMs: 10000 })
}

/**
 * Re-export used by instrumentation / startup code to double-check the VPS is
 * reachable before accepting persistent-env traffic.
 */
export { execAsRoot }
