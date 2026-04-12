import { nanoid } from 'nanoid'
import type {
  SandboxInstance,
  SandboxProvider,
  SandboxCreateConfig,
  SandboxGetOptions,
  CommandResult,
  RunCommandConfig,
} from '../provider'

function getSSHConfig() {
  const host = process.env.SANDBOX_SSH_HOST
  const port = parseInt(process.env.SANDBOX_SSH_PORT || '22', 10)
  const username = process.env.SANDBOX_SSH_USER || 'root'
  const privateKey = process.env.SANDBOX_SSH_KEY
    ? Buffer.from(process.env.SANDBOX_SSH_KEY, 'base64').toString('utf-8')
    : undefined

  if (!host) throw new Error('SANDBOX_SSH_HOST is required for Docker sandbox provider')
  if (!privateKey) throw new Error('SANDBOX_SSH_KEY is required for Docker sandbox provider')

  return { host, port, username, privateKey }
}

async function sshExec(
  command: string,
  timeoutMs: number = 60000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { Client } = await import('ssh2')

  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdoutBuf = ''
    let stderrBuf = ''
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`))
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
              stdoutBuf += data.toString()
            })
            .stderr.on('data', (data: Buffer) => {
              stderrBuf += data.toString()
            })
        })
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect(getSSHConfig())
  })
}

/** Retry SSH execution with exponential backoff */
async function sshExecRetry(
  command: string,
  maxRetries: number = 3,
  timeoutMs: number = 30000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let lastError: Error | undefined
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sshExec(command, timeoutMs)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }
  throw lastError
}

class DockerSandboxInstance implements SandboxInstance {
  sandboxId: string
  private containerName: string
  private sandboxDomain: string
  private exposedPorts: number[]

  constructor(sandboxId: string, ports: number[] = []) {
    this.sandboxId = sandboxId
    this.containerName = `sandbox-${sandboxId}`
    this.sandboxDomain = process.env.SANDBOX_DOMAIN || 'localhost'
    this.exposedPorts = ports
  }

  async runCommand(commandOrConfig: string | RunCommandConfig, args?: string[]): Promise<CommandResult> {
    let cmd: string
    let cwd: string | undefined
    let env: Record<string, string> | undefined

    if (typeof commandOrConfig === 'string') {
      const escapedArgs = (args || []).map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
      cmd = escapedArgs ? `${commandOrConfig} ${escapedArgs}` : commandOrConfig
    } else {
      const config = commandOrConfig
      const escapedArgs = (config.args || []).map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
      cmd = escapedArgs ? `${config.cmd} ${escapedArgs}` : config.cmd
      cwd = config.cwd
      env = config.env

      if (config.detached) {
        cmd = `nohup sh -c '${cmd.replace(/'/g, "'\\''")}' > /dev/null 2>&1 &`
      }
    }

    // Build env prefix
    const envPrefix = env
      ? Object.entries(env)
          .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ') + ' '
      : ''

    const cwdPrefix = cwd ? `cd '${cwd}' && ` : ''
    const fullCmd = `${cwdPrefix}${envPrefix}${cmd}`

    // Use sh -c inside docker exec for proper shell interpretation
    const dockerCmd = `docker exec ${this.containerName} sh -c '${fullCmd.replace(/'/g, "'\\''")}'`

    const result = await sshExecRetry(dockerCmd, 2, 120000)

    return {
      exitCode: result.exitCode,
      stdout: async () => result.stdout,
      stderr: async () => result.stderr,
    }
  }

  domain(port: number): string {
    // If SANDBOX_DOMAIN is set, use subdomain-based routing (requires Traefik/Caddy)
    if (this.sandboxDomain && this.sandboxDomain !== 'localhost') {
      return `https://${this.containerName}.${this.sandboxDomain}`
    }
    // Fallback: direct IP + mapped port
    const host = process.env.SANDBOX_SSH_HOST || 'localhost'
    return `http://${host}:${port}`
  }

  async stop(): Promise<void> {
    try {
      await sshExecRetry(`docker stop ${this.containerName} 2>/dev/null; docker rm ${this.containerName} 2>/dev/null`)
    } catch {
      // Container may already be stopped/removed
    }
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  async create(config: SandboxCreateConfig): Promise<SandboxInstance> {
    // Pre-spawn: enforce global concurrency cap.
    const sshConfig = getSSHConfig()
    const { countCoworkSandboxes, getMaxConcurrentSandboxes } = await import('../concurrency')
    const cap = getMaxConcurrentSandboxes()
    const current = await countCoworkSandboxes(sshConfig)
    if (current >= cap) {
      const { SandboxCapError } = await import('../errors')
      throw new SandboxCapError()
    }

    const id = nanoid(10).toLowerCase()
    const containerName = `sandbox-${id}`

    // Image: prefer explicit config.image (office-cowork task), else fall back to node:<runtime>
    const image =
      config.image ?? (config.runtime === 'node22' ? 'node:22' : `node:${config.runtime?.replace('node', '') || '22'}`)

    const ports = config.ports || [3000]
    const vcpus = config.resources?.vcpus ?? 2
    const memMb = config.resources?.memMb ?? 2048
    const pids = config.resources?.pids ?? 512

    const portFlags = ports.map((p) => `-p ${p}`).join(' ')

    // Env flags — passed as separate shell tokens. Values are SSH-escaped inline.
    // IMPORTANT: never log envFlags or the final createCmd; they contain the user's Anthropic key.
    const envFlags = config.env
      ? Object.entries(config.env)
          .map(([k, v]) => `-e ${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ')
      : ''

    // Artifact volume — host path is assumed to exist and be writable by the SSH user.
    const volumeFlag = config.artifactVolume ? `-v '${config.artifactVolume.replace(/'/g, "'\\''")}:/out'` : ''

    // Base create command. For the node:* fallback we keep the apt-get bootstrap;
    // for cowork-claw/runner:latest the entrypoint already has everything.
    const bootstrap =
      image === 'node:22' || image.startsWith('node:')
        ? `sh -c 'apt-get update -qq && apt-get install -y -qq git curl > /dev/null 2>&1; sleep infinity'`
        : '' // runner image has its own ENTRYPOINT

    const createCmd = [
      `docker run -d --name ${containerName}`,
      portFlags,
      `--memory=${memMb}m --cpus=${vcpus} --pids-limit=${pids}`,
      `--label cowork-claw=true`,
      `--label sandbox-id=${id}`,
      envFlags,
      volumeFlag,
      image,
      bootstrap,
    ]
      .filter((s) => s.length > 0)
      .join(' ')

    let createResult: { exitCode: number; stdout: string; stderr: string }
    try {
      createResult = await sshExecRetry(createCmd, 2, 60000)
    } catch {
      const { SandboxStartError } = await import('../errors')
      throw new SandboxStartError()
    }

    if (createResult.exitCode !== 0) {
      const { SandboxStartError } = await import('../errors')
      // Static log — do NOT include stderr (may contain env or paths).
      console.error('Sandbox create failed')
      throw new SandboxStartError()
    }

    const instance = new DockerSandboxInstance(id, ports)

    // Readiness probe — only for the node:* bootstrap path. Runner image is ready immediately.
    if (bootstrap) {
      for (let i = 0; i < 30; i++) {
        const check = await sshExec(`docker exec ${containerName} which git 2>/dev/null`, 15000).catch(() => null)
        if (check && check.exitCode === 0) break
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      await sshExecRetry(`docker exec ${containerName} mkdir -p /vercel/sandbox/project`)
    }

    // Clone git source if requested (unchanged behaviour).
    if (config.source?.url) {
      const depthFlag = config.source.depth ? `--depth ${config.source.depth}` : ''
      const revisionFlag = config.source.revision ? `-b ${config.source.revision}` : ''
      const cloneCmd = `docker exec ${containerName} git clone ${depthFlag} ${revisionFlag} '${config.source.url}' /vercel/sandbox/project`
      await sshExecRetry(cloneCmd, 2, 120000)
    }

    // Auto-cleanup timer — unchanged.
    if (config.timeout) {
      const timeoutSec = Math.floor(config.timeout / 1000)
      await sshExec(
        `nohup sh -c 'sleep ${timeoutSec} && docker stop ${containerName} 2>/dev/null && docker rm ${containerName} 2>/dev/null' > /dev/null 2>&1 &`,
      )
    }

    return instance
  }

  async get(options: SandboxGetOptions): Promise<SandboxInstance> {
    const containerName = `sandbox-${options.sandboxId}`
    const result = await sshExecRetry(
      `docker inspect ${containerName} --format '{{.State.Running}}' 2>/dev/null`,
      2,
      10000,
    )
    if (result.exitCode !== 0 || result.stdout.trim() !== 'true') {
      throw new Error('Container not found or not running')
    }
    return new DockerSandboxInstance(options.sandboxId)
  }
}
