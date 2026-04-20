import 'server-only'

import type { Writable } from 'stream'

import type { CommandResult, RunCommandConfig, SandboxInstance } from '@/lib/sandbox/provider'
import { execAsUser, shellEscapeSingleQuoted, streamAsUser } from '@/lib/company/vps-client'

/**
 * SandboxInstance implementation that runs every command on the company VPS
 * as a specific Linux user via `sudo -u <user> -H bash -lc`.
 *
 * Unlike the Docker sandbox, a UserEnvInstance is tied to a specific task
 * workdir inside the user's home (repo checkout or fresh ~/tasks/<id> dir)
 * but the underlying Linux account itself is long-lived.
 *
 * `stop()` is a no-op: the env persists between tasks.
 */
export class UserEnvInstance implements SandboxInstance {
  environmentId: string
  projectDir: string
  private linuxUsername: string

  constructor(params: { environmentId: string; linuxUsername: string; projectDir: string }) {
    this.environmentId = params.environmentId
    this.linuxUsername = params.linuxUsername
    this.projectDir = params.projectDir
  }

  async runCommand(commandOrConfig: string | RunCommandConfig, args?: string[]): Promise<CommandResult> {
    let cmd: string
    let cwd: string | undefined
    let env: Record<string, string> | undefined
    let stdoutSink: Writable | undefined
    let stderrSink: Writable | undefined

    if (typeof commandOrConfig === 'string') {
      const escapedArgs = (args || []).map((a) => `'${shellEscapeSingleQuoted(a)}'`).join(' ')
      cmd = escapedArgs ? `${commandOrConfig} ${escapedArgs}` : commandOrConfig
    } else {
      const config = commandOrConfig
      const escapedArgs = (config.args || []).map((a) => `'${shellEscapeSingleQuoted(a)}'`).join(' ')
      cmd = escapedArgs ? `${config.cmd} ${escapedArgs}` : config.cmd
      cwd = config.cwd
      env = config.env
      stdoutSink = config.stdout
      stderrSink = config.stderr
      // Note: `config.detached` is intentionally ignored. For Docker it wrapped
      // the command in `nohup ... &` which silently dropped stdout/stderr and
      // was incompatible with Writable-based progress streaming. On the env
      // pathway we always run attached and forward live output when a sink is
      // provided; agents that want fire-and-forget should use `nohup` in the
      // command string explicitly.
    }

    try {
      if (stdoutSink || stderrSink) {
        const result = await streamAsUser(
          this.linuxUsername,
          cmd,
          {
            onStdout: stdoutSink ? (chunk) => stdoutSink.write(chunk) : undefined,
            onStderr: stderrSink ? (chunk) => stderrSink.write(chunk) : undefined,
          },
          {
            cwd,
            env,
            // Long ceiling: agent CLIs routinely run 30-90min; give ourselves
            // headroom. Callers needing tighter budgets must wrap externally.
            timeoutMs: 4 * 60 * 60 * 1000,
          },
        )
        return {
          exitCode: result.exitCode,
          stdout: async () => result.stdout,
          stderr: async () => result.stderr,
        }
      }

      const result = await execAsUser(this.linuxUsername, cmd, {
        cwd,
        env,
        timeoutMs: 4 * 60 * 60 * 1000,
        maxRetries: 1,
      })

      return {
        exitCode: result.exitCode,
        stdout: async () => result.stdout,
        stderr: async () => result.stderr,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'exec failed'
      return {
        exitCode: 1,
        stdout: async () => '',
        stderr: async () => msg,
      }
    }
  }

  /**
   * Port-forward / preview URLs are not implemented for persistent envs yet.
   * Returns a stub so callers don't blow up; Phase D's web-terminal covers
   * interactive access.
   */
  domain(port: number): string {
    const host = process.env.SANDBOX_SSH_HOST || 'localhost'
    return `http://${host}:${port}`
  }

  /** No-op: the Linux user account and home survive between tasks. */
  async stop(): Promise<void> {
    // intentionally empty
  }
}
