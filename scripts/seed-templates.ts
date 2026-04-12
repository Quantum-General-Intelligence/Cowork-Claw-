/**
 * Template seed stub. P4 will replace this with the full 10-template seed.
 * For P2 we upsert a single 'smoke' template so integration tests have something
 * to assert on.
 */
import 'dotenv/config'
import postgres from 'postgres'

export async function seedTemplates(): Promise<void> {
  const sql = postgres(process.env.POSTGRES_URL!, { max: 1 })
  try {
    const exists = await sql`
      SELECT to_regclass('public.workflow_templates') AS t
    `
    if (!exists[0].t) {
      console.log('seed-templates: workflow_templates table not present yet, skipping')
      return
    }
    await sql`
      INSERT INTO workflow_templates (slug, name, description, category, icon, agent_team_json, default_prompt, params_schema)
      VALUES (
        'smoke',
        'Smoke Test Template',
        'Used by integration tests. Do not delete.',
        'system',
        'wrench',
        '[]'::jsonb,
        'smoke',
        '{}'::jsonb
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
    `
    console.log('seed-templates: upserted smoke template')
  } finally {
    await sql.end()
  }
}

if (require.main === module) {
  seedTemplates().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
