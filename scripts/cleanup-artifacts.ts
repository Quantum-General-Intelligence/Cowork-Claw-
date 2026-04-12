/**
 * Nightly cleanup: delete artifacts older than 7 days and their DB rows.
 * Run via cron: 0 3 * * * pnpm exec tsx scripts/cleanup-artifacts.ts
 */
import 'dotenv/config'
import postgres from 'postgres'
import { readdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'

const ARTIFACT_ROOT = process.env.ARTIFACT_ROOT || '/var/lib/cowork-artifacts'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

async function main() {
  const sql = postgres(process.env.POSTGRES_URL!, { max: 1 })
  const cutoff = new Date(Date.now() - MAX_AGE_MS)
  let cleaned = 0

  try {
    // Delete old DB rows and get their paths
    const old = await sql`
      DELETE FROM task_artifacts
      WHERE created_at < ${cutoff}
      RETURNING path
    `

    // Also scan the filesystem for orphaned task dirs
    try {
      const dirs = readdirSync(ARTIFACT_ROOT)
      for (const dir of dirs) {
        const full = join(ARTIFACT_ROOT, dir)
        try {
          const stat = statSync(full)
          if (stat.isDirectory() && stat.mtimeMs < Date.now() - MAX_AGE_MS) {
            rmSync(full, { recursive: true, force: true })
            cleaned++
          }
        } catch {
          // skip inaccessible dirs
        }
      }
    } catch {
      // ARTIFACT_ROOT may not exist yet
    }

    console.log('Cleaned ' + old.length + ' DB rows, ' + cleaned + ' orphaned dirs')
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
