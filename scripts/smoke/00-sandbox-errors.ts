import { SandboxCapError, SandboxStartError, SandboxDiskError, isSandboxError } from '../../lib/sandbox/errors'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

const cap = new SandboxCapError()
assert(cap.code === 'CW-SBX01', 'cap code')
assert(cap.message === 'Sandbox capacity reached', 'cap message is static')
assert(isSandboxError(cap), 'isSandboxError recognises cap')

const start = new SandboxStartError()
assert(start.code === 'CW-SBX02', 'start code')

const disk = new SandboxDiskError()
assert(disk.code === 'CW-SBX03', 'disk code')

assert(!isSandboxError(new Error('random')), 'isSandboxError rejects plain Error')

console.log('PASS scripts/smoke/00-sandbox-errors.ts')
