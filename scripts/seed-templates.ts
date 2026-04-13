import 'dotenv/config'
import postgres from 'postgres'
import { nanoid } from 'nanoid'

const TEMPLATES = [
  // ── Original 10 public templates ──────────────────────────────────────────
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

  // ── TheoSym internal templates ────────────────────────────────────────────
  {
    slug: 'theosym-product-demo-script',
    name: '[TheoSym] Product Demo Script',
    description: 'Generate a demo script and talking points for a TheoSym product (TheoMax, Symprise, RobySym, ChatGMP, LIMS AI).',
    category: 'internal',
    icon: 'play-circle',
    agentTeamJson: ['copywriter', 'researcher', 'editor'],
    defaultPrompt:
      'Create a product demo script for {{product}} aimed at {{audience}}. Target duration: {{duration}} minutes.\n\nStructure:\n1. Intro (hook + context, ~10% of time)\n2. Demo Flow 1 — core value prop\n3. Demo Flow 2 — key differentiator\n4. Demo Flow 3 — advanced / power-user scenario\n5. Q&A Prep (10 likely questions with concise answers)\n\nTone: confident, technically credible, outcome-focused. Highlight TheoSym\'s AI-native approach throughout.',
    paramsSchema: {
      product: { type: 'string', label: 'TheoSym product (TheoMax, Symprise, RobySym, ChatGMP, LIMS AI)', required: true },
      audience: { type: 'string', label: 'Target audience (e.g. pharma R&D team, Series B investors)', required: true },
      duration: { type: 'string', label: 'Demo duration in minutes (e.g. 20, 45)', required: true },
    },
  },
  {
    slug: 'theosym-investor-monthly-update',
    name: '[TheoSym] Investor Monthly Update',
    description: 'TheoSym-specific investor update covering AI metrics, model benchmarks, revenue, and pipeline.',
    category: 'internal',
    icon: 'bar-chart-2',
    agentTeamJson: ['analyst', 'copywriter', 'editor'],
    defaultPrompt:
      'Write a monthly investor update email for TheoSym using the following metrics JSON:\n\n{{metrics_json}}\n\nSections to include:\n- Executive Summary (3 sentences max)\n- AI Product Metrics (model accuracy, benchmark scores, API calls, uptime)\n- Revenue & Pipeline (MRR, new deals, churn, pipeline value)\n- Key Wins this month\n- Risks & Mitigations\n- Next Month Focus\n\nTone: data-driven, transparent, forward-looking. Audience: sophisticated tech investors.',
    paramsSchema: {
      metrics_json: { type: 'string', label: 'Metrics JSON blob (MRR, benchmarks, pipeline, etc.)', required: true },
    },
  },
  {
    slug: 'theosym-partnership-outreach',
    name: '[TheoSym] Partnership Outreach Sequence',
    description: 'Cold outreach to potential integration partners for a TheoSym product.',
    category: 'internal',
    icon: 'link',
    agentTeamJson: ['researcher', 'copywriter', 'editor'],
    defaultPrompt:
      'Write a partnership outreach sequence targeting {{target_company}} for a potential integration with {{theosym_product}}.\n\nDeliver:\n1. Cold email (subject line + body, under 150 words) — focus on mutual value\n2. LinkedIn connection message (under 300 characters)\n3. Follow-up email #1 (day 5 — add value, light nudge)\n4. Follow-up email #2 (day 12 — create urgency, propose a 20-min call)\n\nTone: peer-to-peer, technically informed. Assume the recipient is a VP of Product or CTO.',
    paramsSchema: {
      target_company: { type: 'string', label: 'Target company name', required: true },
      theosym_product: { type: 'string', label: 'TheoSym product to integrate (TheoMax, Symprise, etc.)', required: true },
    },
  },

  // ── Trelexa internal templates ────────────────────────────────────────────
  {
    slug: 'trelexa-press-release',
    name: '[Trelexa] Press Release Draft',
    description: 'AP-style press release in Trelexa\'s house style, ready for distribution to 120+ Google News sites.',
    category: 'internal',
    icon: 'newspaper',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Draft a press release for distribution via Trelexa\'s network (120+ Google News sites).\n\nAnnouncement: {{announcement}}\nCompany: {{company}}\nQuotes provided: {{quotes}}\n\nFormat: strict AP style.\nStructure:\n- FOR IMMEDIATE RELEASE header\n- Dateline + lead paragraph (who, what, when, where, why)\n- Supporting paragraph (context, data)\n- Quote block (format exactly as provided)\n- Boilerplate for {{company}}\n- Media contact placeholder\n\nLength: 400–500 words. SEO-optimised headline. No fluff.',
    paramsSchema: {
      announcement: { type: 'string', label: 'What is being announced', required: true },
      company: { type: 'string', label: 'Company name', required: true },
      quotes: { type: 'string', label: 'Approved quotes (name, title, quote text)', required: true },
    },
  },
  {
    slug: 'trelexa-authority-report',
    name: '[Trelexa] Client Authority Report',
    description: 'Monthly authority report for a Trelexa client: media placements, SEO impact, and authority score progression.',
    category: 'internal',
    icon: 'award',
    agentTeamJson: ['analyst', 'copywriter', 'designer', 'editor'],
    defaultPrompt:
      'Generate a monthly authority report for Trelexa client {{client_name}}.\n\nData provided:\n- Placements this month: {{placements}}\n- Metrics: {{metrics}}\n\nReport sections:\n1. Executive Summary — authority score change, headline stat\n2. Media Placements Table — publication, date, URL, DA score, estimated reach\n3. SEO Impact — estimated organic lift, keyword movements, backlink value\n4. Authority Score Dashboard — current score, MoM change, 3-month trend\n5. Strategic Recommendations for next month\n\nTone: professional, results-focused. Present as a branded PDF-style document with clear section headers.',
    paramsSchema: {
      client_name: { type: 'string', label: 'Client name', required: true },
      placements: { type: 'string', label: 'Placements this month (list of publications / URLs)', required: true },
      metrics: { type: 'string', label: 'Metrics (traffic, DA scores, backlinks, etc.)', required: true },
    },
  },
  {
    slug: 'trelexa-life-ipo-content-package',
    name: '[Trelexa] Life IPO Content Package',
    description: 'Full multi-format content package for a Life IPO VIP client: book chapter outline, social posts, and article pitches.',
    category: 'internal',
    icon: 'package',
    agentTeamJson: ['copywriter', 'researcher', 'social-media', 'editor'],
    defaultPrompt:
      'Create the Life IPO VIP content package for {{client_name}}.\n\nClient expertise: {{expertise}}\nStory arc: {{story_arc}}\n\nDeliver:\n1. Book Chapter Outline — title, 6–8 section headings with 2-sentence descriptions each, suggested anecdotes/examples\n2. 5 Social Posts — mix of LinkedIn (2), Twitter/X (2), Instagram caption (1). Each post must drive authority and tell part of the story arc.\n3. 3 Article Pitches — publication name suggestion, headline, 100-word pitch, why this author for this outlet\n\nTone: thought-leadership, authentic, high-status. Every piece should reinforce the client\'s personal brand as an industry authority.',
    paramsSchema: {
      client_name: { type: 'string', label: 'Client name', required: true },
      expertise: { type: 'string', label: 'Client\'s area of expertise', required: true },
      story_arc: { type: 'string', label: 'Core story arc / transformation narrative', required: true },
    },
  },

  // ── Cowork-Claw internal ops templates ───────────────────────────────────
  {
    slug: 'coworkclaw-feature-changelog',
    name: '[Cowork-Claw] Feature Changelog Entry',
    description: 'Public changelog post, tweet, and LinkedIn post for a Cowork-Claw feature release.',
    category: 'internal',
    icon: 'git-merge',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Write a public changelog entry for a Cowork-Claw product release.\n\nFeature: {{feature_name}}\nWhat it does: {{description}}\nWho it\'s for: {{target_users}}\n\nDeliver:\n1. Changelog Post (blog-style, 200–300 words) — lead with the user benefit, explain the feature, include a "how to use it" section, end with a CTA\n2. Tweet (under 280 chars) — punchy, benefit-first, includes a relevant emoji and #CoworkClaw hashtag\n3. LinkedIn Post (100–150 words) — professional tone, focus on productivity/team impact, ends with a question to drive comments\n\nBrand voice: smart, direct, slightly playful. Never use corporate jargon.',
    paramsSchema: {
      feature_name: { type: 'string', label: 'Feature name', required: true },
      description: { type: 'string', label: 'What the feature does', required: true },
      target_users: { type: 'string', label: 'Who it\'s for (e.g. power users, team admins)', required: true },
    },
  },
  {
    slug: 'coworkclaw-onboarding-sequence',
    name: '[Cowork-Claw] Customer Onboarding Email Sequence',
    description: '5-email drip sequence for new Cowork-Claw subscribers, tailored by plan and use case.',
    category: 'internal',
    icon: 'mail-open',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Write a 5-email onboarding drip sequence for a new Cowork-Claw subscriber.\n\nPlan tier: {{plan_tier}}\nUse case: {{use_case}}\n\nEmails (include subject line + body for each):\n1. Welcome (day 0) — warm welcome, what to do first, link to dashboard\n2. First Task Guide (day 1) — walk through running their first workflow, tips for success\n3. Template Tour (day 3) — highlight 3 most relevant templates for their use case, explain how to customize\n4. Power Tips (day 7) — 3 advanced tips (agent teams, param schemas, approval flows), invite to community\n5. Upgrade Nudge (day 14, only if on free/starter) — show what they\'re missing on {{plan_tier}} vs next tier, soft CTA\n\nTone: helpful, concise, human. Each email under 200 words. No corporate speak.',
    paramsSchema: {
      plan_tier: { type: 'string', label: 'Plan tier (free, starter, pro, team)', required: true },
      use_case: { type: 'string', label: 'Primary use case (e.g. content marketing, sales ops, research)', required: true },
    },
  },
  {
    slug: 'coworkclaw-support-response-templates',
    name: '[Cowork-Claw] Support Response Templates',
    description: 'Canned support responses for common Cowork-Claw issues across billing, sandbox, key validation, and templates.',
    category: 'internal',
    icon: 'help-circle',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Generate 5 canned support response templates for the following Cowork-Claw issue category: {{issue_category}}\n\nValid categories: billing, sandbox errors, key validation, template issues.\n\nFor each response:\n- Subject / Ticket title\n- Opening (acknowledge the issue empathetically)\n- Clear resolution steps or explanation\n- Offer for further help\n- Closing\n\nIssue category details / context: {{context}}\n\nTone: friendly, efficient, non-technical where possible. Each response under 150 words. Include [PLACEHOLDER] markers for variable info like order numbers or usernames.',
    paramsSchema: {
      issue_category: { type: 'string', label: 'Issue category (billing, sandbox errors, key validation, template issues)', required: true },
      context: { type: 'string', label: 'Additional context or specific scenario details', required: false },
    },
  },

  // ── Cross-company templates ───────────────────────────────────────────────
  {
    slug: 'portfolio-weekly-standup',
    name: '[Portfolio] Weekly Standup Summary',
    description: 'Compile a weekly standup doc from bullet points across all portfolio companies.',
    category: 'internal',
    icon: 'list',
    agentTeamJson: ['analyst', 'copywriter', 'editor'],
    defaultPrompt:
      'Compile a weekly standup summary document from the following bullet points per company.\n\nBullet points:\n{{bullet_points}}\n\nFormat:\n- Header: Week of [date], Portfolio Standup\n- Per-company section (TheoSym, Trelexa, Qalitex, Care Europe, QGI, Cowork-Claw — skip any not mentioned)\n  - Progress / Done\n  - Blockers\n  - Next week\n- Cross-portfolio section: Shared highlights, shared blockers, dependencies between companies\n- Action items table: Owner | Task | Due\n\nTone: crisp, factual, scannable. No padding.',
    paramsSchema: {
      bullet_points: { type: 'string', label: 'Bullet points per company (paste raw notes)', required: true },
    },
  },
  {
    slug: 'portfolio-competitive-intelligence',
    name: '[Portfolio] Competitive Intelligence Brief',
    description: 'Structured competitor brief for any portfolio company: product, pricing, strengths, weaknesses, opportunities.',
    category: 'internal',
    icon: 'eye',
    agentTeamJson: ['researcher', 'analyst', 'editor'],
    defaultPrompt:
      'Research and write a competitive intelligence brief on {{competitor}} for {{portfolio_company}}.\n\nBrief sections:\n1. Competitor Overview — founding, team size, funding, market position\n2. Product Analysis — key features, tech stack (if known), UX observations\n3. Pricing & GTM — pricing tiers, channels, ICP\n4. Strengths — what they do well\n5. Weaknesses — gaps, complaints (use review sites, forums)\n6. Opportunities for {{portfolio_company}} — where we can differentiate or outmanoeuvre\n7. Watch List — upcoming product moves, recent hires, funding signals\n\nSources: use public data only. Flag any claims that are inferred vs confirmed.',
    paramsSchema: {
      competitor: { type: 'string', label: 'Competitor name', required: true },
      portfolio_company: { type: 'string', label: 'Which portfolio company this is for (TheoSym, Trelexa, Qalitex, etc.)', required: true },
    },
  },
  {
    slug: 'portfolio-social-media-batch',
    name: '[Portfolio] Social Media Batch (1 week)',
    description: 'Generate a full week of social content for any portfolio brand across Twitter, LinkedIn, and Instagram.',
    category: 'internal',
    icon: 'share-2',
    agentTeamJson: ['copywriter', 'social-media', 'editor'],
    defaultPrompt:
      'Create a week of social media content for {{brand_name}}.\n\nKey messages this week: {{key_messages}}\nBrand tone: {{tone}}\n\nDeliver 7 posts (one per day, Monday–Sunday).\nFor each post provide:\n- Day and platform (Twitter/X or LinkedIn, alternate; add Instagram caption for days 1, 3, 5)\n- Post copy (Twitter: under 280 chars; LinkedIn: 100–200 words; Instagram: 80–120 words + hashtag suggestions)\n- Suggested visual description (1 sentence)\n\nVariety: mix educational, behind-the-scenes, social proof, and engagement-bait formats. Each post must feel native to its platform.',
    paramsSchema: {
      brand_name: { type: 'string', label: 'Brand name (e.g. TheoSym, Trelexa, Cowork-Claw)', required: true },
      key_messages: { type: 'string', label: 'Key messages / topics for this week', required: true },
      tone: { type: 'string', label: 'Brand tone (e.g. authoritative, playful, technical)', required: true },
    },
  },
  {
    slug: 'portfolio-blog-from-notes',
    name: '[Portfolio] Blog Post from Meeting Notes',
    description: 'Turn rough meeting notes into a polished, SEO-optimised blog post with tweet variants.',
    category: 'internal',
    icon: 'edit-3',
    agentTeamJson: ['copywriter', 'seo', 'editor'],
    defaultPrompt:
      'Transform the following raw meeting notes into a polished blog post.\n\nRaw notes:\n{{raw_notes}}\n\nTarget audience: {{target_audience}}\nDesired length: {{desired_length}} words\n\nDeliver:\n1. Blog Post — H1 title, intro (hook + thesis), 3–5 H2 sections with body copy, conclusion with CTA. SEO-optimised: include primary keyword naturally, internal link placeholders [INTERNAL LINK: topic], and alt-text suggestions for 2 image placeholders.\n2. Meta Description (under 160 chars)\n3. 3 Tweet variants — different angles (insight, quote pull, question)',
    paramsSchema: {
      raw_notes: { type: 'string', label: 'Paste raw meeting notes', required: true },
      target_audience: { type: 'string', label: 'Target audience for the post', required: true },
      desired_length: { type: 'string', label: 'Desired word count (e.g. 800, 1200)', required: false },
    },
  },
  {
    slug: 'portfolio-invoice-followup',
    name: '[Portfolio] Invoice / Proposal Follow-Up Sequence',
    description: 'Three escalation emails (gentle, firm, final) for an outstanding invoice or unsigned proposal.',
    category: 'internal',
    icon: 'dollar-sign',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Write a 3-email follow-up sequence for an outstanding {{document_type}} (invoice or proposal).\n\nClient: {{client}}\nAmount: {{amount}}\nDays overdue/outstanding: {{days_overdue}}\nRelationship context: {{relationship_context}}\n\nEmails:\n1. Gentle reminder (day {{days_overdue}}) — friendly, assume positive intent, include payment/signing link placeholder\n2. Firm follow-up (5 days later) — professional urgency, reference previous email, reiterate terms, offer a 5-min call to resolve\n3. Final notice (10 days after email 2) — clear deadline, consequences outlined (late fees, pausing work), escalation path\n\nEach email: subject line + body under 150 words. Preserve the existing relationship while protecting the business.',
    paramsSchema: {
      document_type: { type: 'string', label: 'Document type (invoice or proposal)', required: true },
      client: { type: 'string', label: 'Client name', required: true },
      amount: { type: 'string', label: 'Amount (e.g. €4,500)', required: true },
      days_overdue: { type: 'string', label: 'Days overdue or outstanding', required: true },
      relationship_context: { type: 'string', label: 'Relationship context (e.g. long-term client, new client, warm referral)', required: false },
    },
  },
  {
    slug: 'portfolio-okr-review',
    name: '[Portfolio] Quarterly OKR Review',
    description: 'Formatted quarterly OKR review with traffic-light status, narrative summary, and next quarter draft.',
    category: 'internal',
    icon: 'target',
    agentTeamJson: ['analyst', 'copywriter', 'editor'],
    defaultPrompt:
      'Generate a quarterly OKR review document.\n\nOKRs with scores and commentary:\n{{okrs}}\n\nDocument structure:\n1. Quarter Summary — 3-sentence narrative on overall performance\n2. OKR Status Table — Objective | Key Result | Target | Actual | Score (0–1.0) | Status (Green/Amber/Red)\n3. Wins — top 3 achievements this quarter\n4. Misses & Lessons — what fell short and why (no blame, actionable insights)\n5. Next Quarter Draft OKRs — propose 3 objectives with 2–3 key results each, informed by this quarter\'s learnings\n\nTone: honest, analytical, forward-looking. Traffic-light colour codes in the table. Suitable for sharing with the full team and board.',
    paramsSchema: {
      okrs: { type: 'string', label: 'OKRs with scores and commentary (paste raw or structured)', required: true },
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
        INSERT INTO workflow_templates (id, slug, name, description, category, icon, agent_team_json, default_prompt, params_schema, default_agent)
        VALUES (
          ${nanoid()},
          ${t.slug},
          ${t.name},
          ${t.description},
          ${t.category},
          ${t.icon},
          ${JSON.stringify(t.agentTeamJson)}::jsonb,
          ${t.defaultPrompt},
          ${JSON.stringify(t.paramsSchema)}::jsonb,
          ${t.category === 'internal' ? 'gemini' : 'claude'}
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          icon = EXCLUDED.icon,
          agent_team_json = EXCLUDED.agent_team_json,
          default_prompt = EXCLUDED.default_prompt,
          params_schema = EXCLUDED.params_schema,
          default_agent = EXCLUDED.default_agent,
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
