/**
 * Smoke test 2: factory + SandboxProvider interface parity
 *
 * This is the test that protects every existing call site from the @vercel/sandbox
 * removal. It calls the factory exactly the way the app does, exercises the
 * full interface, and asserts the shapes are unchanged.
 *
 * Run with: pnpm exec tsx scripts/smoke/02-factory-parity.ts
 */
import 'dotenv/config'
import { getSandboxProvider } from '../../lib/sandbox/factory'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

async function main() {
  const provider = getSandboxProvider()

  // Shape check: the factory returns something with create + get.
  assert(typeof provider.create === 'function', 'provider.create is a function')
  assert(typeof provider.get === 'function', 'provider.get is a function')

  console.log('Creating sandbox via factory...')
  const sandbox = await provider.create({
    image: 'cowork-claw/runner:latest',
    resources: { vcpus: 1, memMb: 512, pids: 256 },
    timeout: 60_000,
    env: {
      ANTHROPIC_API_KEY: process.env.SMOKE_ANTHROPIC_API_KEY || 'smoke-placeholder',
      TASK_ID: 'smoke-parity',
      TEMPLATE_SLUG: 'smoke',
      PARAMS_JSON: 'parity',
    },
  })

  // Interface: sandboxId, runCommand (both overloads), domain, stop.
  assert(typeof sandbox.sandboxId === 'string', 'sandboxId is a string')
  assert(typeof sandbox.runCommand === 'function', 'runCommand is a function')
  assert(typeof sandbox.domain === 'function', 'domain is a function')
  assert(typeof sandbox.stop === 'function', 'stop is a function')

  // runCommand(string, string[]) overload
  const echo = await sandbox.runCommand('echo', ['parity-ok'])
  assert(echo.exitCode === 0, 'echo exit 0')
  const echoOut = await echo.stdout()
  assert(echoOut.includes('parity-ok'), 'echo stdout contains parity-ok')

  // runCommand({ cmd, args, env }) overload
  const envEcho = await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', 'echo $PARITY_VAR'],
    env: { PARITY_VAR: 'parity-env-ok' },
  })
  assert(envEcho.exitCode === 0, 'env echo exit 0')
  const envOut = await envEcho.stdout()
  assert(envOut.includes('parity-env-ok'), 'env echo stdout contains parity-env-ok')

  // domain() returns a string
  const d = sandbox.domain(3000)
  assert(typeof d === 'string' && d.length > 0, 'domain(3000) returns non-empty string')

  await sandbox.stop()
  console.log('PASS scripts/smoke/02-factory-parity.ts')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
