/**
 * Smoke test 1: DockerSandboxProvider contract
 *
 * Creates a container from cowork-claw/runner:latest, asserts it runs, writes
 * the expected file into the mounted artifact volume, and stops cleanly.
 *
 * Requires .env.local with SANDBOX_SSH_* set. Run with:
 *   pnpm exec tsx scripts/smoke/01-docker-provider-contract.ts
 */
import 'dotenv/config'
import { DockerSandboxProvider } from '../../lib/sandbox/providers/docker'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

async function main() {
  const provider = new DockerSandboxProvider()

  // The artifact volume must exist on the docker host, not on the machine running this script.
  // For a single-VPS setup where the script runs on the same host as dockerd, we can use a host path.
  // For a remote docker host, set SMOKE_ARTIFACT_VOLUME to a path that exists there.
  const artifactVolume =
    process.env.SMOKE_ARTIFACT_VOLUME || `/tmp/cowork-smoke-${Date.now()}`

  console.log('Creating sandbox with runner image...')
  const sandbox = await provider.create({
    image: 'cowork-claw/runner:latest',
    resources: { vcpus: 1, memMb: 512, pids: 256 },
    timeout: 120_000,
    env: {
      ANTHROPIC_API_KEY: process.env.SMOKE_ANTHROPIC_API_KEY || 'smoke-placeholder',
      TASK_ID: 'smoke-task',
      TEMPLATE_SLUG: 'smoke',
      PARAMS_JSON: 'hello from smoke test',
    },
    artifactVolume,
  })

  assert(typeof sandbox.sandboxId === 'string' && sandbox.sandboxId.length > 0, 'sandboxId is non-empty')

  // Poll for /out/result.md inside the container (not on host — we may be remote).
  console.log('Polling for /out/result.md inside the container...')
  let found = false
  for (let i = 0; i < 30; i++) {
    const check = await sandbox.runCommand('test', ['-f', '/out/result.md']).catch(() => null)
    if (check && check.exitCode === 0) {
      found = true
      break
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  assert(found, '/out/result.md should exist inside the container')

  // Read the file back.
  const cat = await sandbox.runCommand('cat', ['/out/result.md'])
  const body = await cat.stdout()
  assert(body.length > 0, 'result.md should be non-empty')

  console.log('Stopping sandbox...')
  await sandbox.stop()

  // Verify the container is gone (using a fresh get call — should throw).
  let stopped = false
  try {
    await provider.get({ sandboxId: sandbox.sandboxId })
  } catch {
    stopped = true
  }
  assert(stopped, 'provider.get after stop should throw')

  console.log('PASS scripts/smoke/01-docker-provider-contract.ts')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
