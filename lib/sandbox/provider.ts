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

/**
 * Uniform interface for "a thing we can run commands inside".
 *
 * Implementations:
 *   - `lib/env/user-env-instance.ts` (persistent user environment via SSH)
 *   - Future providers (local Docker for development, other tenants, ...)
 */
export interface SandboxInstance {
  /**
   * Stable identifier for the underlying environment (per-user VPS env id).
   */
  environmentId: string
  /**
   * Absolute path to the task's working directory inside the instance.
   * For persistent user envs this points at the per-task workdir in the
   * user's home directory (~/projects/<owner>/<repo> or ~/tasks/<taskId>).
   */
  projectDir: string
  runCommand(command: string, args?: string[]): Promise<CommandResult>
  runCommand(config: RunCommandConfig): Promise<CommandResult>
  domain(port: number): string
  stop(): Promise<void>
}
