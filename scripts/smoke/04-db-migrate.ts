/**
 * Smoke test 4: db-migrate one-shot.
 *
 * Boots a throwaway postgres via docker run, points POSTGRES_URL at it,
 * runs the migrate-and-seed script, asserts expected tables exist.
 *
 * Run with: pnpm exec tsx scripts/smoke/04-db-migrate.ts
 */
import 'dotenv/config'
import { spawnSync } from 'child_process'
import postgres from 'postgres'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

function sh(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf-8' })
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
}

async function main() {
  const name = 'cowork-p2-smoke-pg-' + Date.now()
  const port = '55555'
  const dbUrl = `postgres://cowork:cowork@127.0.0.1:${port}/cowork`

  console.log('Starting throwaway postgres...')
  const start = sh('docker', [
    'run', '-d', '--rm',
    '--name', name,
    '-e', 'POSTGRES_USER=cowork',
    '-e', 'POSTGRES_PASSWORD=cowork',
    '-e', 'POSTGRES_DB=cowork',
    '-p', `${port}:5432`,
    'postgres:16-alpine',
  ])
  if (start.code !== 0) {
    console.error('FAIL: could not start postgres:', start.stderr)
    process.exit(1)
  }

  try {
    // Wait for pg to be ready.
    for (let i = 0; i < 30; i++) {
      const check = sh('docker', ['exec', name, 'pg_isready', '-U', 'cowork', '-d', 'cowork'])
      if (check.code === 0) break
      await new Promise((r) => setTimeout(r, 1000))
    }

    console.log('Running migrate-and-seed...')
    const migrate = spawnSync('pnpm', ['exec', 'tsx', 'scripts/db-migrate-and-seed.ts'], {
      stdio: 'inherit',
      env: { ...process.env, POSTGRES_URL: dbUrl },
    })
    assert(migrate.status === 0, 'migrate-and-seed exits 0')

    const sql = postgres(dbUrl, { max: 1 })
    try {
      const users = await sql`SELECT to_regclass('public.users') AS t`
      assert(users[0].t !== null, 'public.users table exists after migrate')
      const tmpl = await sql`SELECT to_regclass('public.workflow_templates') AS t`
      if (tmpl[0].t) {
        const rows = await sql`SELECT slug FROM workflow_templates WHERE slug = 'smoke'`
        assert(rows.length === 1, 'smoke template seeded')
      }
    } finally {
      await sql.end()
    }

    console.log('PASS scripts/smoke/04-db-migrate.ts')
  } finally {
    console.log('Stopping throwaway postgres...')
    sh('docker', ['stop', name])
  }
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
