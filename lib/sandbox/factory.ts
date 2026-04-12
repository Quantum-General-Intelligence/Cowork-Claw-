import type { SandboxProvider } from './provider'

let cachedProvider: SandboxProvider | null = null

export function getSandboxProvider(): SandboxProvider {
  if (cachedProvider) return cachedProvider

  const providerType = process.env.SANDBOX_PROVIDER || (process.env.SANDBOX_SSH_HOST ? 'docker' : 'vercel')

  if (providerType === 'docker') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(/* webpackIgnore: true */ './providers/docker')
    cachedProvider = new mod.DockerSandboxProvider()
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(/* webpackIgnore: true */ './providers/vercel')
    cachedProvider = new mod.VercelSandboxProvider()
  }

  return cachedProvider!
}
