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
  teamId?: string
  projectId?: string
  token?: string
  timeout?: number
  ports?: number[]
  runtime?: string
  resources?: { vcpus?: number }
  source?: {
    type: 'git'
    url: string
    revision?: string
    depth?: number
  }
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
