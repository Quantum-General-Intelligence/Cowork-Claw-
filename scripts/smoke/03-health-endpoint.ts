/**
 * Smoke test 3: /api/health endpoint shape.
 *
 * Prerequisites:
 *   - run against a live app via HEALTH_URL=https://app.cowork-claw.ai/api/health
 *   - or against localhost: HEALTH_URL=http://127.0.0.1:3000/api/health
 */
import 'dotenv/config'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

async function main() {
  const url = process.env.HEALTH_URL || 'http://127.0.0.1:3000/api/health'
  console.log('GET', url)
  const res = await fetch(url)
  const body = (await res.json()) as {
    ok: boolean
    db: boolean
    vps: boolean
    diskFree: boolean
  }

  assert(typeof body.ok === 'boolean', 'ok is boolean')
  assert(typeof body.db === 'boolean', 'db is boolean')
  assert(typeof body.vps === 'boolean', 'vps is boolean')
  assert(typeof body.diskFree === 'boolean', 'diskFree is boolean')
  assert(res.status === 200 || res.status === 503, 'status is 200 or 503')
  assert(body.ok === (body.db && body.vps && body.diskFree), 'ok is AND of the three')

  console.log('PASS scripts/smoke/03-health-endpoint.ts')
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
