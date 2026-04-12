/**
 * One-shot runner for the db-migrate compose service.
 *
 * 1. Runs Drizzle push to sync the schema.
 * 2. Runs the template seed.
 */
import 'dotenv/config'
import { spawnSync } from 'child_process'
import { seedTemplates } from './seed-templates'

async function main() {
  console.log('[db-migrate] running drizzle-kit push')
  const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    console.error('[db-migrate] drizzle push failed')
    process.exit(result.status ?? 1)
  }
  console.log('[db-migrate] seeding templates')
  await seedTemplates()
  console.log('[db-migrate] done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
