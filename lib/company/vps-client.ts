import 'server-only'

// VPS control-plane SSH client.
//
// The app connects to the company VPS as root (SANDBOX_SSH_* env vars) and
// executes commands either directly (execAsRoot) or as a team member's Linux
// user (execAsUser / streamAsUser) via `sudo -u <user> -H bash -lc`.
//
// Security notes:
// - The private key comes from SANDBOX_SSH_KEY (base64-encoded).
// - Never log `cmd` contents: they may contain API keys or credentials.
// - Inner-command escaping for `sudo -u <user> -H bash -lc '<CMD>'` replaces
//   single quotes in <CMD> with `'\''` to survive shell parsing.

export interface SshExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface StreamHandlers {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

function getVpsSshConfig() {
  const host = process.env.SANDBOX_SSH_HOST
  const port = parseInt(process.env.SANDBOX_SSH_PORT || '22', 10)
  const username = process.env.SANDBOX_SSH_USER || 'root'
  const privateKey = process.env.SANDBOX_SSH_KEY
    ? Buffer.from(process.env.SANDBOX_SSH_KEY, 'base64').toString('utf-8')
    : undefined

  if (!host) throw new Error('SANDBOX_SSH_HOST is required')
  if (!privateKey) throw new Error('SANDBOX_SSH_KEY is required')

  return { host, port, username, privateKey }
}

/** Escape a string so it survives single-quoted shell wrapping. */
export function shellEscapeSingleQuoted(s: string): string {
  return s.replace(/'/g, "'\\''")
}

/** Escape a username so it can't be injected into a shell command. */
export function assertValidLinuxUsername(username: string): void {
  // Linux usernames: [a-z_][a-z0-9_-]{0,31}, but we enforce our stricter pattern.
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(username)) {
    throw new Error('invalid linux username')
  }
}

async function sshExec(command: string, timeoutMs: number = 60000, handlers?: StreamHandlers): Promise<SshExecResult> {
  const { Client } = await import('ssh2')

  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdoutBuf = ''
    let stderrBuf = ''
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error('SSH command timed out'))
    }, timeoutMs)

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer)
            conn.end()
            return reject(err)
          }
          stream
            .on('close', (code: number) => {
              clearTimeout(timer)
              conn.end()
              resolve({ exitCode: code ?? 0, stdout: stdoutBuf, stderr: stderrBuf })
            })
            .on('data', (data: Buffer) => {
              const chunk = data.toString()
              stdoutBuf += chunk
              handlers?.onStdout?.(chunk)
            })
            .stderr.on('data', (data: Buffer) => {
              const chunk = data.toString()
              stderrBuf += chunk
              handlers?.onStderr?.(chunk)
            })
        })
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect(getVpsSshConfig())
  })
}

async function sshExecRetry(
  command: string,
  maxRetries: number = 3,
  timeoutMs: number = 30000,
  handlers?: StreamHandlers,
): Promise<SshExecResult> {
  let lastError: Error | undefined
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sshExec(command, timeoutMs, handlers)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }
  throw lastError
}

export interface ExecOptions {
  timeoutMs?: number
  maxRetries?: number
  /** Working directory; wrapped as `cd 'DIR' && ...` */
  cwd?: string
  /** Extra env vars to prepend as `KEY='val' ... cmd` */
  env?: Record<string, string>
}

/** Run a raw shell command on the VPS as root (no sudo -u wrapping). */
export async function execAsRoot(cmd: string, opts: ExecOptions = {}): Promise<SshExecResult> {
  let wrapped = cmd
  if (opts.env) {
    const envPrefix = Object.entries(opts.env)
      .map(([k, v]) => `${k}='${shellEscapeSingleQuoted(v)}'`)
      .join(' ')
    wrapped = `${envPrefix} ${wrapped}`
  }
  if (opts.cwd) {
    wrapped = `cd '${shellEscapeSingleQuoted(opts.cwd)}' && ${wrapped}`
  }
  return sshExecRetry(wrapped, opts.maxRetries ?? 2, opts.timeoutMs ?? 60000)
}

/**
 * Run a shell command on the VPS as a target Linux user via `sudo -u <user>`.
 *
 * `cmd` is passed to `bash -lc` so it supports pipes, `&&`, subshells, etc.
 * `opts.env` values are exported inside the login shell (as opposed to the
 * outer sudo call) so `bash -lc` picks them up through normal shell env.
 */
export async function execAsUser(linuxUsername: string, cmd: string, opts: ExecOptions = {}): Promise<SshExecResult> {
  assertValidLinuxUsername(linuxUsername)

  const envExports = opts.env
    ? Object.entries(opts.env)
        .map(([k, v]) => `export ${k}='${shellEscapeSingleQuoted(v)}'`)
        .join('; ') + '; '
    : ''
  const cdPrefix = opts.cwd ? `cd '${shellEscapeSingleQuoted(opts.cwd)}' && ` : ''
  const inner = `${envExports}${cdPrefix}${cmd}`
  const outer = `sudo -u '${linuxUsername}' -H bash -lc '${shellEscapeSingleQuoted(inner)}'`

  return sshExecRetry(outer, opts.maxRetries ?? 2, opts.timeoutMs ?? 60000)
}

/**
 * Stream a long-running command as a target user with stdout/stderr handlers.
 * Returns once the command exits.
 */
export async function streamAsUser(
  linuxUsername: string,
  cmd: string,
  handlers: StreamHandlers,
  opts: ExecOptions = {},
): Promise<SshExecResult> {
  assertValidLinuxUsername(linuxUsername)

  const envExports = opts.env
    ? Object.entries(opts.env)
        .map(([k, v]) => `export ${k}='${shellEscapeSingleQuoted(v)}'`)
        .join('; ') + '; '
    : ''
  const cdPrefix = opts.cwd ? `cd '${shellEscapeSingleQuoted(opts.cwd)}' && ` : ''
  const inner = `${envExports}${cdPrefix}${cmd}`
  const outer = `sudo -u '${linuxUsername}' -H bash -lc '${shellEscapeSingleQuoted(inner)}'`

  return sshExec(outer, opts.timeoutMs ?? 30 * 60 * 1000, handlers)
}

/**
 * Write `contents` to `remotePath` in the user's home and chown it to that
 * user. Uses base64 + tee to avoid shell-escaping issues with binary / JSON.
 */
export async function copyToHome(
  linuxUsername: string,
  remotePath: string,
  contents: string | Buffer,
  mode: string = '600',
): Promise<void> {
  assertValidLinuxUsername(linuxUsername)
  if (!remotePath.startsWith('/')) throw new Error('remotePath must be absolute')

  const b64 = (typeof contents === 'string' ? Buffer.from(contents, 'utf-8') : contents).toString('base64')
  const dir = remotePath.substring(0, remotePath.lastIndexOf('/')) || '/'

  const cmd = [
    `install -d -m 700 -o '${linuxUsername}' -g '${linuxUsername}' '${shellEscapeSingleQuoted(dir)}'`,
    `echo '${b64}' | base64 -d > '${shellEscapeSingleQuoted(remotePath)}'`,
    `chown '${linuxUsername}':'${linuxUsername}' '${shellEscapeSingleQuoted(remotePath)}'`,
    `chmod ${mode} '${shellEscapeSingleQuoted(remotePath)}'`,
  ].join(' && ')

  const result = await execAsRoot(cmd)
  if (result.exitCode !== 0) {
    throw new Error('failed to copy file to home')
  }
}

/** Quick health check: can we SSH at all? */
export async function pingVps(): Promise<boolean> {
  try {
    const r = await execAsRoot('echo VPS_OK', { timeoutMs: 10000, maxRetries: 1 })
    return r.exitCode === 0 && r.stdout.includes('VPS_OK')
  } catch {
    return false
  }
}
