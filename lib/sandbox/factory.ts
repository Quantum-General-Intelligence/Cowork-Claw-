import type { SandboxProvider } from './provider'
import { DockerSandboxProvider } from './providers/docker'

let cachedProvider: SandboxProvider | null = null

export function getSandboxProvider(): SandboxProvider {
  if (!cachedProvider) {
    cachedProvider = new DockerSandboxProvider()
  }
  return cachedProvider
}
