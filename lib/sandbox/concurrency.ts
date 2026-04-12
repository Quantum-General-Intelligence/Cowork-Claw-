import type { Client } from 'ssh2'

/**
 * Counts currently-running sandbox containers on the docker host by the
 * `cowork-claw=true` label. Used as a pre-spawn gate in DockerSandboxProvider.
 *
 * This file re-implements a minimal SSH exec to avoid importing from
 * providers/docker.ts (which would create a cycle). In production we should
 * refactor sshExec into a shared module; for P1 we duplicate the 30 lines.
 */

export async function countCoworkSandboxes(sshConfig: {
  host: string
  port: number
  username: string
  privateKey: string
}): Promise<number> {
  const { Client } = await import('ssh2')
  const cmd = 'docker ps --filter label=cowork-claw=true -q | wc -l'

  return new Promise<number>((resolve, reject) => {
    const conn = new Client() as Client
    let stdout = ''
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error('Concurrency check timed out'))
    }, 5000)

    conn
      .on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) {
            clearTimeout(timer)
            conn.end()
            return reject(err)
          }
          stream
            .on('close', () => {
              clearTimeout(timer)
              conn.end()
              const n = parseInt(stdout.trim(), 10)
              resolve(Number.isFinite(n) ? n : 0)
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString()
            })
        })
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect(sshConfig)
  })
}

export function getMaxConcurrentSandboxes(): number {
  const raw = process.env.MAX_CONCURRENT_SANDBOXES
  const n = raw ? parseInt(raw, 10) : 8
  return Number.isFinite(n) && n > 0 ? n : 8
}
