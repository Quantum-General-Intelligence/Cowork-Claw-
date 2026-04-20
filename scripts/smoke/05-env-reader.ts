import { getEnv } from '../../lib/env'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

process.env.POSTGRES_URL = 'postgres://test:test@localhost/test'
process.env.SANDBOX_SSH_HOST = 'example.test'
process.env.SANDBOX_SSH_KEY = 'Zm9v'

delete require.cache[require.resolve('../../lib/env')]

const env = getEnv()
assert(env.POSTGRES_URL.startsWith('postgres://'), 'POSTGRES_URL read')
assert(env.SANDBOX_SSH_PORT === 22, 'SANDBOX_SSH_PORT defaults to 22')
assert(env.SANDBOX_SSH_USER === 'root', 'SANDBOX_SSH_USER defaults to root')
assert(env.ARTIFACT_ROOT === '/var/lib/cowork-artifacts', 'ARTIFACT_ROOT default')

console.log('PASS scripts/smoke/05-env-reader.ts')
