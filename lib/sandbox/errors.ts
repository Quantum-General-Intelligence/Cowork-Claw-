/**
 * Sentinel errors thrown by DockerSandboxProvider. Each carries a stable CW-* code
 * that the Next task route maps to an HTTP response. Per AGENTS.md, these messages
 * must be static — callers never interpolate dynamic values into them.
 */

export class SandboxCapError extends Error {
  readonly code = 'CW-SBX01'
  constructor() {
    super('Sandbox capacity reached')
    this.name = 'SandboxCapError'
  }
}

export class SandboxStartError extends Error {
  readonly code = 'CW-SBX02'
  constructor() {
    super('Sandbox failed to start')
    this.name = 'SandboxStartError'
  }
}

export class SandboxDiskError extends Error {
  readonly code = 'CW-SBX03'
  constructor() {
    super('Sandbox host is out of disk')
    this.name = 'SandboxDiskError'
  }
}

export function isSandboxError(err: unknown): err is SandboxCapError | SandboxStartError | SandboxDiskError {
  return err instanceof SandboxCapError || err instanceof SandboxStartError || err instanceof SandboxDiskError
}
