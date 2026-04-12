import { Writable } from 'stream'

export interface CommandResult {
  exitCode: number
  stdout: () => Promise<string>
  stderr: () => Promise<string>
}

export interface RunCommandConfig {
  cmd: string
  args?: string[]
  cwd?: string
  detached?: boolean
  sudo?: boolean
  env?: Record<string, string>
  stdout?: Writable
  stderr?: Writable
  [key: string]: unknown
}

export interface SandboxInstance {
  sandboxId: string
  runCommand(command: string, args?: string[]): Promise<CommandResult>
  runCommand(config: RunCommandConfig): Promise<CommandResult>
  domain(port: number): string
  stop(): Promise<void>
}

export interface SandboxCreateConfig {
  /** Legacy Vercel fields — kept optional so existing call sites still type-check during the migration. Ignored by DockerSandboxProvider. */
  teamId?: string
  projectId?: string
  token?: string

  /** Docker image to run. Defaults to `node:22` for backward compatibility with the classic dev-sandbox flow. Set to `cowork-claw/runner:latest` for office-cowork tasks. */
  image?: string

  /** Hard timeout (ms) after which the container is force-stopped and removed by a background cleanup timer. */
  timeout?: number

  /** Ports to publish on the host. Only relevant to classic dev-sandbox flow. Office-cowork tasks ignore this. */
  ports?: number[]

  /** Legacy runtime hint ("node22", etc.). Ignored when `image` is set. */
  runtime?: string

  /** Per-container resource caps. */
  resources?: {
    vcpus?: number
    memMb?: number
    pids?: number
  }

  /** Git source to clone into `/vercel/sandbox/project` at spawn time. Optional for office-cowork tasks. */
  source?: {
    type: 'git'
    url: string
    revision?: string
    depth?: number
  }

  /** Environment variables to set inside the container at `docker run` time. NEVER log these. */
  env?: Record<string, string>

  /** Absolute host path to mount at `/out` inside the container. If set, the Next task route must ensure the directory exists and is writable by the SSH user before calling `create()`. */
  artifactVolume?: string
}

export interface SandboxGetOptions {
  sandboxId: string
  teamId?: string
  projectId?: string
  token?: string
}

export interface SandboxProvider {
  create(config: SandboxCreateConfig): Promise<SandboxInstance>
  get(options: SandboxGetOptions): Promise<SandboxInstance>
}
