/**
 * Typed runtime env reader.
 *
 * Fails fast on missing required values so we notice misconfiguration at boot,
 * not mid-task. Call `requireEnv()` once at app start (e.g., in a server-only
 * module) to surface errors loudly.
 */

export interface RuntimeEnv {
  POSTGRES_URL: string
  SANDBOX_SSH_HOST: string
  SANDBOX_SSH_PORT: number
  SANDBOX_SSH_USER: string
  SANDBOX_SSH_KEY: string
  MAX_CONCURRENT_SANDBOXES: number
  ARTIFACT_ROOT: string
}

class MissingEnvError extends Error {
  constructor(key: string) {
    super('Missing required env: ' + key)
    this.name = 'MissingEnvError'
  }
}

function readString(key: string, required: true): string
function readString(key: string, required: false, fallback: string): string
function readString(key: string, required: boolean, fallback?: string): string {
  const v = process.env[key]
  if (v && v.length > 0) return v
  if (required) throw new MissingEnvError(key)
  return fallback!
}

function readInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

let cached: RuntimeEnv | null = null

export function getEnv(): RuntimeEnv {
  if (cached) return cached
  cached = {
    POSTGRES_URL: readString('POSTGRES_URL', true),
    SANDBOX_SSH_HOST: readString('SANDBOX_SSH_HOST', true),
    SANDBOX_SSH_PORT: readInt('SANDBOX_SSH_PORT', 22),
    SANDBOX_SSH_USER: readString('SANDBOX_SSH_USER', false, 'root'),
    SANDBOX_SSH_KEY: readString('SANDBOX_SSH_KEY', true),
    MAX_CONCURRENT_SANDBOXES: readInt('MAX_CONCURRENT_SANDBOXES', 8),
    ARTIFACT_ROOT: readString('ARTIFACT_ROOT', false, '/var/lib/cowork-artifacts'),
  }
  return cached
}

export function requireEnv(): void {
  getEnv()
}
