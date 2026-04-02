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

async function sshExec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { Client } = await import('ssh2')
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdoutBuf = ''
    let stderrBuf = ''

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end()
            return reject(err)
          }
          stream
            .on('close', (code: number) => {
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
      .on('error', reject)
      .connect(getSSHConfig())
  })
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

    if (typeof commandOrConfig === 'string') {
      const escapedArgs = (args || []).map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
      cmd = escapedArgs ? `${commandOrConfig} ${escapedArgs}` : commandOrConfig
    } else {
      const config = commandOrConfig
      const escapedArgs = (config.args || []).map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
      cmd = escapedArgs ? `${config.cmd} ${escapedArgs}` : config.cmd
      cwd = config.cwd

      if (config.detached) {
        cmd = `nohup ${cmd} > /dev/null 2>&1 &`
      }
    }

    const cwdPrefix = cwd ? `cd '${cwd}' && ` : ''
    const dockerCmd = `docker exec ${this.containerName} sh -c '${cwdPrefix}${cmd.replace(/'/g, "'\\''")}'`

    const result = await sshExec(dockerCmd)

    return {
      exitCode: result.exitCode,
      stdout: async () => result.stdout,
      stderr: async () => result.stderr,
    }
  }

  domain(port: number): string {
    return `https://${this.containerName}.${this.sandboxDomain}`
  }

  async stop(): Promise<void> {
    await sshExec(`docker stop ${this.containerName} 2>/dev/null; docker rm ${this.containerName} 2>/dev/null`)
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  async create(config: SandboxCreateConfig): Promise<SandboxInstance> {
    const id = nanoid(10).toLowerCase()
    const containerName = `sandbox-${id}`
    const image = config.runtime === 'node22' ? 'node:22' : `node:${config.runtime?.replace('node', '') || '22'}`
    const ports = config.ports || [3000]

    // Build port mapping flags
    const portFlags = ports.map((p) => `-p ${p}`).join(' ')

    // Create container
    const createCmd = `docker run -d --name ${containerName} ${portFlags} --memory=4g --cpus=${config.resources?.vcpus || 4} ${image} sleep infinity`
    const createResult = await sshExec(createCmd)

    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create container: ${createResult.stderr}`)
    }

    const instance = new DockerSandboxInstance(id, ports)

    // Create project directory
    await instance.runCommand('mkdir', ['-p', '/vercel/sandbox/project'])

    // Clone repo if source provided
    if (config.source?.url) {
      const depthFlag = config.source.depth ? `--depth ${config.source.depth}` : ''
      const revisionFlag = config.source.revision ? `-b ${config.source.revision}` : ''
      const cloneCmd = `git clone ${depthFlag} ${revisionFlag} '${config.source.url}' /vercel/sandbox/project`
      await sshExec(`docker exec ${containerName} sh -c '${cloneCmd}'`)
    }

    // Set timeout to auto-stop container
    if (config.timeout) {
      const timeoutSec = Math.floor(config.timeout / 1000)
      await sshExec(
        `(sleep ${timeoutSec} && docker stop ${containerName} 2>/dev/null && docker rm ${containerName} 2>/dev/null) &`,
      )
    }

    return instance
  }

  async get(options: SandboxGetOptions): Promise<SandboxInstance> {
    const containerName = `sandbox-${options.sandboxId}`
    const result = await sshExec(`docker inspect ${containerName} --format '{{.State.Running}}'`)

    if (result.exitCode !== 0 || result.stdout.trim() !== 'true') {
      throw new Error(`Container ${containerName} not found or not running`)
    }

    return new DockerSandboxInstance(options.sandboxId)
  }
}
