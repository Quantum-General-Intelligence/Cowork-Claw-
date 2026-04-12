import 'dotenv/config'
import postgres from 'postgres'
import { nanoid } from 'nanoid'

const TEMPLATES = [
  {
    slug: 'pitch-deck',
    name: 'Pitch Deck Builder',
    description: 'Create a 10-12 slide pitch deck from your company brief.',
    category: 'sales',
    icon: 'presentation',
    agentTeamJson: ['researcher', 'copywriter', 'designer', 'editor'],
    defaultPrompt: 'Build a pitch deck for {{company}} targeting {{audience}}. Offer: {{offer}}. Tone: {{tone}}.',
    paramsSchema: {
      company: { type: 'string', label: 'Company name', required: true },
      audience: { type: 'string', label: 'Audience (investors, clients, internal)', required: true },
      offer: { type: 'string', label: 'Product/offer one-liner', required: true },
      tone: { type: 'string', label: 'Tone (optional)', required: false },
    },
  },
  {
    slug: 'cold-outbound',
    name: 'Cold-Outbound Prospecting',
    description: 'Generate an enriched list of qualified prospects from your ICP.',
    category: 'sales',
    icon: 'users',
    agentTeamJson: ['researcher', 'data-analyst', 'copywriter'],
    defaultPrompt:
      'Find {{count}} qualified prospects matching this ICP: {{icp}}. Enrich with name, company, role, reason-to-reach-out, and a personalized first line.',
    paramsSchema: {
      icp: { type: 'string', label: 'Ideal Customer Profile', required: true },
      count: { type: 'string', label: 'Number of prospects (default: 25)', required: false },
    },
  },
  {
    slug: 'proposal-sow',
    name: 'Proposal / SOW Generator',
    description: 'Draft a branded proposal with deliverables, timeline, and pricing.',
    category: 'operations',
    icon: 'file-text',
    agentTeamJson: ['copywriter', 'analyst', 'editor'],
    defaultPrompt:
      'Write a proposal for client {{client}}. Scope: {{scope}}. Include deliverables, timeline, and pricing sections.',
    paramsSchema: {
      client: { type: 'string', label: 'Client name', required: true },
      scope: { type: 'string', label: 'Scope / project notes', required: true },
    },
  },
  {
    slug: 'market-research',
    name: 'Market & Competitor Research',
    description: 'Structured research brief with competitors, positioning, and recommendations.',
    category: 'research',
    icon: 'search',
    agentTeamJson: ['researcher', 'analyst', 'editor'],
    defaultPrompt:
      'Research the market around {{topic}}. Identify top 5 competitors, their positioning, pricing, strengths, and gaps. Recommend positioning for us.',
    paramsSchema: {
      topic: { type: 'string', label: 'Company or topic to research', required: true },
    },
  },
  {
    slug: 'content-repurpose',
    name: 'Content Repurposing Pipeline',
    description: 'Turn one long-form piece into a Twitter thread, LinkedIn post, newsletter, and shortform script.',
    category: 'marketing',
    icon: 'repeat',
    agentTeamJson: ['copywriter', 'social-media', 'editor'],
    defaultPrompt:
      'Repurpose this content into: 1) Twitter thread, 2) LinkedIn post, 3) Newsletter section, 4) Shortform video script.\n\nContent:\n{{content}}',
    paramsSchema: {
      content: { type: 'string', label: 'Paste your long-form content', required: true },
    },
  },
  {
    slug: 'inbox-triage',
    name: 'Inbox Triage & Reply Drafter',
    description: 'Categorize emails and draft replies for each.',
    category: 'operations',
    icon: 'mail',
    agentTeamJson: ['analyst', 'copywriter'],
    defaultPrompt:
      'Triage these emails. For each: categorize (urgent/important/low/spam), summarize in one line, and draft a reply.\n\nEmails:\n{{emails}}',
    paramsSchema: {
      emails: { type: 'string', label: 'Paste your emails', required: true },
    },
  },
  {
    slug: 'meeting-prep',
    name: 'Meeting Prep Pack',
    description: 'Briefing doc with attendee backgrounds, talking points, and likely objections.',
    category: 'operations',
    icon: 'calendar',
    agentTeamJson: ['researcher', 'analyst', 'copywriter'],
    defaultPrompt:
      'Prepare a meeting brief for: {{meeting}}. Attendees: {{attendees}}. Context: {{context}}. Include attendee backgrounds, talking points, questions to ask, and likely objections.',
    paramsSchema: {
      meeting: { type: 'string', label: 'Meeting topic', required: true },
      attendees: { type: 'string', label: 'Attendee names + roles', required: true },
      context: { type: 'string', label: 'Additional context', required: false },
    },
  },
  {
    slug: 'investor-update',
    name: 'Weekly Investor Update',
    description: 'Formatted update email from your metrics, wins, and blockers.',
    category: 'operations',
    icon: 'trending-up',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Write a weekly investor/stakeholder update. Metrics: {{metrics}}. Wins: {{wins}}. Blockers: {{blockers}}. Tone: concise, confident, honest.',
    paramsSchema: {
      metrics: { type: 'string', label: 'Key metrics this week', required: true },
      wins: { type: 'string', label: 'Wins / progress', required: true },
      blockers: { type: 'string', label: 'Blockers / risks', required: false },
    },
  },
  {
    slug: 'landing-copy',
    name: 'Landing Page Copy',
    description: 'Hero, features, FAQ, and CTAs from a product one-liner.',
    category: 'marketing',
    icon: 'layout',
    agentTeamJson: ['copywriter', 'seo', 'editor'],
    defaultPrompt:
      'Write landing page copy for: {{product}}. Include: hero headline + subtext, 4-6 feature blocks, FAQ (5 questions), and 2 CTA variations.',
    paramsSchema: {
      product: { type: 'string', label: 'Product one-liner', required: true },
    },
  },
  {
    slug: 'hiring-kickoff',
    name: 'Hiring Pipeline Kickoff',
    description: 'JD, interview rubric, scorecard, and sourcing search strings.',
    category: 'operations',
    icon: 'user-plus',
    agentTeamJson: ['copywriter', 'analyst', 'editor'],
    defaultPrompt:
      'Create a hiring pipeline for: {{role}}. Produce: 1) Job description, 2) Interview rubric (4 rounds), 3) Scorecard template, 4) Boolean sourcing strings for LinkedIn.',
    paramsSchema: {
      role: { type: 'string', label: 'Role description', required: true },
    },
  },
]

export async function seedTemplates(): Promise<void> {
  const sql = postgres(process.env.POSTGRES_URL!, { max: 1 })
  try {
    const exists = await sql`SELECT to_regclass('public.workflow_templates') AS t`
    if (!exists[0].t) {
      console.log('seed-templates: workflow_templates table not present yet, skipping')
      return
    }

    for (const t of TEMPLATES) {
      await sql`
        INSERT INTO workflow_templates (id, slug, name, description, category, icon, agent_team_json, default_prompt, params_schema)
        VALUES (
          ${nanoid()},
          ${t.slug},
          ${t.name},
          ${t.description},
          ${t.category},
          ${t.icon},
          ${JSON.stringify(t.agentTeamJson)}::jsonb,
          ${t.defaultPrompt},
          ${JSON.stringify(t.paramsSchema)}::jsonb
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          icon = EXCLUDED.icon,
          agent_team_json = EXCLUDED.agent_team_json,
          default_prompt = EXCLUDED.default_prompt,
          params_schema = EXCLUDED.params_schema,
          updated_at = now()
      `
    }
    console.log('seed-templates: upserted ' + TEMPLATES.length + ' templates')
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
