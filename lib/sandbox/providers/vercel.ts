import { Sandbox } from '@vercel/sandbox'
import type {
  SandboxInstance,
  SandboxProvider,
  SandboxCreateConfig,
  SandboxGetOptions,
  CommandResult,
  RunCommandConfig,
} from '../provider'

class VercelSandboxInstance implements SandboxInstance {
  private sandbox: Sandbox

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox
  }

  get sandboxId(): string {
    return this.sandbox.sandboxId
  }

  async runCommand(commandOrConfig: string | RunCommandConfig, args?: string[]): Promise<CommandResult> {
    if (typeof commandOrConfig === 'string') {
      return this.sandbox.runCommand(commandOrConfig, args || [])
    }
    return this.sandbox.runCommand(commandOrConfig as Parameters<Sandbox['runCommand']>[0])
  }

  domain(port: number): string {
    return this.sandbox.domain(port)
  }

  async stop(): Promise<void> {
    await this.sandbox.stop()
  }
}

export class VercelSandboxProvider implements SandboxProvider {
  async create(config: SandboxCreateConfig): Promise<SandboxInstance> {
    const sandbox = await Sandbox.create({
      teamId: config.teamId || process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: config.projectId || process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: config.token || process.env.SANDBOX_VERCEL_TOKEN!,
      timeout: config.timeout,
      ports: config.ports,
      runtime: config.runtime,
      resources: config.resources as { vcpus: number } | undefined,
      source: config.source,
    })
    return new VercelSandboxInstance(sandbox)
  }

  async get(options: SandboxGetOptions): Promise<SandboxInstance> {
    const sandbox = await Sandbox.get({
      sandboxId: options.sandboxId,
      teamId: options.teamId || process.env.SANDBOX_VERCEL_TEAM_ID!,
      projectId: options.projectId || process.env.SANDBOX_VERCEL_PROJECT_ID!,
      token: options.token || process.env.SANDBOX_VERCEL_TOKEN!,
    })
    return new VercelSandboxInstance(sandbox)
  }
}
