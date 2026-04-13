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

  // ── Trelexa Hub templates ─────────────────────────────────────────────────
  // Content & Blogging
  {
    slug: 'trelexa-auto-blog-post',
    name: '[Trelexa] Auto Blog Post',
    description: 'Generate an SEO blog post for a specific Trelexa Hub brand with cross-links and brand style guide.',
    category: 'trelexa',
    icon: 'pen-tool',
    agentTeamJson: ['keyword-research', 'content-quality-auditor', 'entity-optimizer', 'internal-linking-optimizer', 'on-page-seo-auditor'],
    defaultPrompt:
      'Generate a fully SEO-optimised blog post for the {{brand}} brand.\n\nBrand: {{brand}} (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)\nTarget keyword: {{target_keyword}}\nTopic: {{topic}}\n\nOutput format:\n1. YAML frontmatter — title (60 chars max, keyword-first), slug, publishedAt, author, tags (3–5), metaDescription (155 chars max)\n2. H1 — matches SEO title\n3. Intro paragraph — hook + thesis, 80–100 words, keyword in first 100 chars\n4. 4–6 H2 sections with body copy, ~150–200 words each\n5. Cross-links — 2–3 internal links to sister brands (e.g. if brand=qalitex, link to care-europe, nourify) with anchor text\n6. Conclusion + CTA paragraph\n7. Schema markup recommendation (FAQ or BlogPosting)\n\nApply the brand\'s style: Qalitex=scientific/clinical, TheoSym=AI/technical, Trelexa=authority/PR, Care Europe=healthcare/EU, Nourify=wellness, Sam Sammane=personal leadership. Total length: 900–1200 words.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      target_keyword: { type: 'string', label: 'Target keyword', required: true },
      topic: { type: 'string', label: 'Post topic / angle', required: true },
    },
  },
  {
    slug: 'trelexa-content-refresh',
    name: '[Trelexa] Content Refresh',
    description: 'Audit and refresh an existing blog post with updated stats, improved structure, and better internal links.',
    category: 'trelexa',
    icon: 'refresh-cw',
    agentTeamJson: ['content-refresher', 'content-quality-auditor', 'rank-tracker', 'internal-linking-optimizer', 'schema-markup-generator'],
    defaultPrompt:
      'Audit and refresh an existing blog post for the {{brand}} brand.\n\nBrand: {{brand}}\nPost title or URL: {{post_title_or_url}}\nCurrent keyword rankings: {{current_rankings}}\n\nRefresh tasks:\n1. Audit Score — grade the existing post on: keyword placement (H1/H2/intro/conclusion), meta description quality, internal link count, image alt texts, readability (Flesch score estimate), schema markup presence. Score each 1–10.\n2. Updated Stats — flag any statistics older than 18 months and suggest replacement data sources.\n3. Improved Headers — rewrite H2s that are vague or keyword-weak, keep H2s that are strong.\n4. Internal Link Improvements — identify 2 new internal link opportunities to sister brand pages.\n5. Schema Markup — recommend and generate the most appropriate JSON-LD block (FAQ, BlogPosting, or HowTo) based on post content.\n6. Refreshed Post — deliver the full updated post incorporating all improvements.\n\nOutput all 6 sections clearly labelled.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      post_title_or_url: { type: 'string', label: 'Post title or URL', required: true },
      current_rankings: { type: 'string', label: 'Current keyword rankings (keyword → position)', required: false },
    },
  },
  {
    slug: 'trelexa-content-batch-plan',
    name: '[Trelexa] Content Batch Plan',
    description: 'Plan a week of content across all 6 Trelexa Hub sites with keywords, cross-link strategy, and social distribution.',
    category: 'trelexa',
    icon: 'calendar',
    agentTeamJson: ['keyword-research', 'content-gap-analysis', 'internal-linking-optimizer', 'performance-reporter'],
    defaultPrompt:
      'Plan a week of SEO blog content across all 6 Trelexa Hub sites.\n\nWeek start date: {{week_start_date}}\nKey themes or events this week: {{themes_and_events}}\n\nDeliver a content calendar with one post per brand (Qalitex, TheoSym, Trelexa, Care Europe, Nourify, Sam Sammane). For each post include:\n- Brand\n- Post title (keyword-first, 60 chars max)\n- Primary target keyword + estimated monthly search volume tier (high/mid/low)\n- Secondary keywords (2–3)\n- Core topic angle (1 sentence)\n- Cross-link targets — which 1–2 sister brand pages this post should link to and why\n- Ideal publish day (spread Mon–Fri)\n\nAfter the per-brand table, add:\n- Cross-link strategy overview — how the 6 posts link to each other to form a topical cluster\n- Social distribution plan — for each post, list which Blotato accounts and platforms to push to (Facebook, LinkedIn, Instagram, TikTok, Twitter/X, YouTube)\n\nFormat: markdown table for the calendar, prose for strategy.',
    paramsSchema: {
      week_start_date: { type: 'string', label: 'Week start date (e.g. 2026-04-14)', required: true },
      themes_and_events: { type: 'string', label: 'Key themes or industry events this week', required: false },
    },
  },

  // PR & News
  {
    slug: 'trelexa-reactive-press-release',
    name: '[Trelexa] Reactive Press Release',
    description: 'Generate a reactive AP-style press release when an FDA or industry event hits, with brand spokesperson and boilerplate.',
    category: 'trelexa',
    icon: 'newspaper',
    agentTeamJson: ['alert-manager', 'content-quality-auditor', 'entity-optimizer'],
    defaultPrompt:
      'Generate a reactive press release for the {{target_brand}} brand in response to an industry event.\n\nNews headline: {{news_headline}}\nNews details: {{news_details}}\nTarget brand: {{target_brand}} (qalitex / care-europe / ayah-labs / aurora-tic / nourify)\n\nOutput — strict AP-style press release:\n1. FOR IMMEDIATE RELEASE header + dateline\n2. Headline — reactive, keyword-rich, 70 chars max\n3. Subheadline — context sentence\n4. Lead paragraph — who, what, when, where, why (50–60 words)\n5. Supporting paragraph — brand\'s stance, data point or statistic, regulatory context\n6. Expert commentary quote — attribute to the correct brand spokesperson:\n   - Qalitex/Ayah Labs: Dr. Ayah Sammane, Chief Scientific Officer\n   - Care Europe/Aurora TIC: Dr. Jean-Pierre Moreau, Regulatory Affairs Director\n   - Nourify: Sophie Laurent, Head of Nutrition Science\n7. Brand response paragraph — what the brand is doing/recommending\n8. Boilerplate for {{target_brand}}\n9. Media contact placeholder\n\nLength: 450–550 words. No jargon. Distribution notes: list top 3 wire services and journalist angle.',
    paramsSchema: {
      news_headline: { type: 'string', label: 'News headline that triggered this release', required: true },
      news_details: { type: 'string', label: 'News details / summary', required: true },
      target_brand: { type: 'string', label: 'Target brand (qalitex / care-europe / ayah-labs / aurora-tic / nourify)', required: true },
    },
  },
  {
    slug: 'trelexa-google-news-article',
    name: '[Trelexa] Google News Article',
    description: 'Write a Google News-optimised article for placement on DA 35–79 journalist sites with proper attribution.',
    category: 'trelexa',
    icon: 'globe',
    agentTeamJson: ['on-page-seo-auditor', 'entity-optimizer', 'meta-tags-optimizer', 'content-quality-auditor'],
    defaultPrompt:
      'Write a Google News-optimised article for journalist site placement.\n\nBrand being featured: {{brand}}\nTopic: {{topic}}\nTarget keyword: {{target_keyword}}\nJournalist persona: {{journalist_persona}} (e.g. health correspondent, finance journalist, tech reporter)\n\nOutput a 500–800 word news-style article:\n1. Headline — news framing, keyword in first 6 words, under 70 chars\n2. Dateline + byline (use journalist persona as author)\n3. Lead (inverted pyramid) — most important facts first, 50–70 words\n4. Body — 3–4 paragraphs with supporting context, quotes (attribute to brand spokesperson), industry data\n5. Background paragraph — brief context on the brand or trend\n6. Closing quote from industry analyst (invent plausible name and title)\n\nSEO requirements: keyword appears in headline, first paragraph, and one subhead. Include 1 internal link placeholder [LINK: topic]. No promotional language — journalistic, third-person tone throughout. Add a "Distribution notes" section at the end: recommended DA tiers, pitch angle for editors.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand being featured', required: true },
      topic: { type: 'string', label: 'Article topic', required: true },
      target_keyword: { type: 'string', label: 'Target keyword', required: true },
      journalist_persona: { type: 'string', label: 'Journalist persona (e.g. health correspondent, tech reporter)', required: false },
    },
  },
  {
    slug: 'trelexa-authority-package',
    name: '[Trelexa] Authority Package',
    description: 'Generate a full authority content package: bios in 3 lengths, LinkedIn/Twitter copy, article pitches, and speaker one-sheet.',
    category: 'trelexa',
    icon: 'award',
    agentTeamJson: ['content-quality-auditor', 'entity-optimizer', 'geo-content-optimizer'],
    defaultPrompt:
      'Generate a full authority content package for a Trelexa client.\n\nClient name: {{client_name}}\nExpertise area: {{expertise_area}}\nKey achievements: {{key_achievements}}\n\nDeliver the following 6 assets:\n\n1. Bio — 50-word version (for speaker lists and author bylines)\n2. Bio — 150-word version (for media kits and press releases)\n3. Bio — 500-word version (for website About page, full narrative arc)\n4. LinkedIn:\n   - Headline (220 chars max, keyword-rich, value-first)\n   - About section (1500–2000 chars, first-person, storytelling, 3–5 keywords)\n5. Twitter/X bio (160 chars max, punchy, authority signals)\n6. 5 Article pitches — for each: publication suggestion (name category, e.g. Forbes/industry trade), headline, 100-word pitch, why this author for this outlet\n7. Speaker one-sheet — talk title, 50-word abstract, key takeaways (3 bullets), speaker credentials (1 paragraph), headshot placeholder, booking contact placeholder\n\nTone: high-status, authentic, specific. Avoid vague superlatives — every claim must be grounded in the achievements provided.',
    paramsSchema: {
      client_name: { type: 'string', label: 'Client name', required: true },
      expertise_area: { type: 'string', label: 'Area of expertise', required: true },
      key_achievements: { type: 'string', label: 'Key achievements, milestones, credentials', required: true },
    },
  },

  // Outreach & Email
  {
    slug: 'trelexa-industry-alert-sequence',
    name: '[Trelexa] Industry Alert Outreach Sequence',
    description: 'Cold email sequence triggered by an industry event (recall, FDA action) — pure text, no links, under 80 words each.',
    category: 'trelexa',
    icon: 'mail',
    agentTeamJson: ['alert-manager', 'content-quality-auditor'],
    defaultPrompt:
      'Create a cold outreach email sequence triggered by an industry alert event. Follow Instantly campaign rules strictly.\n\nTrigger event: {{trigger_event}} (e.g. FDA recall, contamination alert, regulatory change)\nTrigger details: {{trigger_details}}\nProduct category: {{product_category}}\nProspect risk: {{prospect_risk}} (how this event affects the prospect\'s business)\n\nDeliver a 3-email sequence. Hard rules for every email:\n- Pure plain text, zero HTML, zero links, zero images\n- Under 80 words per email body (not counting subject line)\n- Subject line must look like a colleague forwarded it (e.g. "Fwd: re: the [event]" or "quick heads up on [topic]")\n- No company name, no logo references, no CTA buttons\n- Tone: peer-to-peer, genuine concern, no sales language\n\nEmail 1 (Day 0): Alert the prospect to the event and its direct risk to their operation. End with a soft question.\nEmail 2 (Day 3): Follow up with one specific data point or consequence. Lightly reference email 1.\nEmail 3 (Day 7): Final check-in. Acknowledge they\'re busy. One clear next step framed as a favour.\n\nFormat: [Subject] / [Body] for each email.',
    paramsSchema: {
      trigger_event: { type: 'string', label: 'Trigger event (e.g. FDA recall, contamination alert)', required: true },
      trigger_details: { type: 'string', label: 'Event details / summary', required: true },
      product_category: { type: 'string', label: 'Product category (e.g. dietary supplements, lab reagents)', required: true },
      prospect_risk: { type: 'string', label: 'How this event risks the prospect\'s business', required: true },
    },
  },
  {
    slug: 'trelexa-lead-enrichment',
    name: '[Trelexa] Lead Enrichment',
    description: 'Enrich raw leads with contact details, company data, and personalised first lines tied to a recent trigger.',
    category: 'trelexa',
    icon: 'users',
    agentTeamJson: ['content-quality-auditor', 'alert-manager'],
    defaultPrompt:
      'Enrich a batch of raw leads for Instantly outreach.\n\nRaw leads (company names + roles):\n{{raw_leads_list}}\n\nFor each lead, research and output the following enriched fields in CSV format:\n- Company name\n- Contact full name (most likely decision-maker for the given role)\n- Title / role\n- Estimated email (firstname.lastname@company.com pattern or known format)\n- LinkedIn URL (estimated: linkedin.com/in/firstname-lastname)\n- Company size tier (1–10 / 11–50 / 51–200 / 201–500 / 500+)\n- Industry vertical\n- Recent trigger (a specific recent event: funding round, product launch, news mention, regulatory event — sourced from public data)\n- Personalised first line (1 sentence, references the trigger, sounds like a human wrote it, no fluff)\n\nOutput as a markdown table first, then a raw CSV block. Flag any leads where enrichment confidence is low (mark "LOW CONFIDENCE" in a notes column).',
    paramsSchema: {
      raw_leads_list: { type: 'string', label: 'Paste raw leads (company name + role, one per line or CSV)', required: true },
    },
  },

  // SEO & Technical
  {
    slug: 'trelexa-seo-audit',
    name: '[Trelexa] On-Page SEO Audit',
    description: 'Full scored on-page SEO audit for any Trelexa Hub brand page with specific fix recommendations.',
    category: 'trelexa',
    icon: 'search',
    agentTeamJson: ['on-page-seo-auditor', 'technical-seo-checker', 'content-quality-auditor', 'meta-tags-optimizer', 'schema-markup-generator'],
    defaultPrompt:
      'Perform a full on-page SEO audit for a Trelexa Hub brand page.\n\nBrand: {{brand}}\nURL or page path: {{url_or_page_path}}\nTarget keyword: {{target_keyword}}\n\nAudit checklist — score each item 1–10 and provide a specific fix recommendation:\n\n1. Title Tag — length (50–60 chars), keyword placement (first 6 words), click-worthiness\n2. Meta Description — length (145–160 chars), keyword inclusion, CTA presence\n3. H1 — single H1, keyword match, clarity\n4. H2–H6 Structure — logical hierarchy, keyword variation in subheads\n5. Keyword Density — primary keyword frequency (target 1–1.5%), LSI keywords present\n6. Internal Links — count, anchor text quality, links to/from sister brand pages\n7. Schema Markup — present/absent, correct type, validation status\n8. Image Alt Texts — descriptive, keyword-inclusive where natural\n9. Core Web Vitals notes — flag any known issues (LCP, CLS, INP) if detectable from page structure\n10. Content Quality — E-E-A-T signals, readability, freshness\n\nSummary: overall score (average of 10 items), top 3 priority fixes, estimated SEO impact of fixes (high/medium/low).',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      url_or_page_path: { type: 'string', label: 'URL or page path to audit', required: true },
      target_keyword: { type: 'string', label: 'Target keyword for this page', required: true },
    },
  },
  {
    slug: 'trelexa-schema-markup',
    name: '[Trelexa] Schema Markup Generator',
    description: 'Generate complete JSON-LD schema markup for any page type, ready to paste with validation notes.',
    category: 'trelexa',
    icon: 'code',
    agentTeamJson: ['schema-markup-generator', 'on-page-seo-auditor', 'technical-seo-checker'],
    defaultPrompt:
      'Generate JSON-LD schema markup for a Trelexa Hub brand page.\n\nBrand: {{brand}}\nPage type: {{page_type}} (BlogPosting / FAQPage / Organization / Service / Product / Person)\nPage content summary: {{page_content_summary}}\n\nOutput:\n1. Complete JSON-LD block — ready to paste into a <script type="application/ld+json"> tag. Populate all required and recommended fields for the chosen schema type. Use realistic values based on the brand and content summary provided.\n   - BlogPosting: headline, author (use correct brand author), datePublished, dateModified, publisher, image placeholder, description, mainEntityOfPage\n   - FAQPage: mainEntity array with 3–5 Q&A pairs extracted from the content summary\n   - Organization: name, url, logo, sameAs (social profiles), contactPoint\n   - Service: serviceType, provider, areaServed, description, offers\n   - Product: name, description, brand, offers, aggregateRating placeholder\n   - Person: name, jobTitle, worksFor, sameAs, description\n2. Validation notes — list any fields left as placeholders and why, plus a link to the relevant Google Rich Results Test\n3. Implementation tip — where to place the script tag in the page (head vs body) and any CMS-specific notes',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      page_type: { type: 'string', label: 'Schema type (BlogPosting / FAQPage / Organization / Service / Product / Person)', required: true },
      page_content_summary: { type: 'string', label: 'Page content summary (paste key facts, title, description)', required: true },
    },
  },
  {
    slug: 'trelexa-keyword-cluster',
    name: '[Trelexa] Keyword Cluster Builder',
    description: 'Build a keyword cluster with topic map, intent groupings, and content plan for any brand and seed keyword.',
    category: 'trelexa',
    icon: 'layers',
    agentTeamJson: ['keyword-research', 'serp-analysis', 'competitor-analysis', 'content-gap-analysis', 'rank-tracker'],
    defaultPrompt:
      'Build a keyword cluster and topic map for a Trelexa Hub brand.\n\nBrand: {{brand}}\nSeed keyword: {{seed_keyword}}\nMarket: {{market}} (US / EU / Global)\n\nOutput:\n1. Primary keyword — confirm or refine the seed keyword based on search intent and brand fit\n2. Keyword cluster (10–15 keywords) grouped by intent:\n   - Informational (what/how/why queries) — 4–5 keywords\n   - Commercial investigation (best/compare/review queries) — 3–4 keywords\n   - Transactional (buy/get/order queries) — 2–3 keywords\n   - Navigational (brand + product queries) — 1–2 keywords\n3. For each keyword: estimated monthly search volume tier (high >10k / mid 1k–10k / low <1k), keyword difficulty estimate (easy/medium/hard), and current brand rank if estimable\n4. Content plan — map each keyword to a specific page type:\n   - New blog post needed\n   - Existing page to optimise\n   - New landing page needed\n   - Internal link only (no dedicated page)\n5. Cluster visualisation — ASCII diagram showing how the primary keyword + supporting content connects\n6. Quick wins — 3 keywords where low difficulty + mid/high volume = fastest ranking opportunity',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      seed_keyword: { type: 'string', label: 'Seed keyword', required: true },
      market: { type: 'string', label: 'Market (US / EU / Global)', required: true },
    },
  },

  // Social & Distribution
  {
    slug: 'trelexa-social-distribution',
    name: '[Trelexa] Social Distribution Package',
    description: 'Generate a platform-specific social media distribution package for a blog post or PR with Blotato scheduling notes.',
    category: 'trelexa',
    icon: 'share-2',
    agentTeamJson: ['content-quality-auditor', 'meta-tags-optimizer', 'performance-reporter'],
    defaultPrompt:
      'Generate a social media distribution package for a Trelexa Hub content piece.\n\nBrand: {{brand}}\nContent title: {{content_title}}\nContent summary: {{content_summary}}\nPlatforms: {{platforms}} (comma-separated: twitter / linkedin / instagram / tiktok / youtube)\n\nFor each requested platform, deliver a platform-native post:\n\n- Twitter/X: 3 tweet variants (under 280 chars each) — angles: insight hook, quote pull, engagement question. Include 1 relevant emoji per tweet, no hashtag spam (max 2 hashtags).\n- LinkedIn: 150–200 word post — professional framing, opens with a bold statement (no "I\'m excited to share"), 3–5 line breaks for readability, ends with a discussion question. 3–5 hashtags.\n- Instagram: 80–120 word caption — story-driven, conversational, strong first line (stops the scroll), 10–15 hashtags in first comment (list separately).\n- TikTok: video script hook + caption — 3-second hook line, 15-second spoken script outline, caption under 150 chars + 5 trending hashtags.\n- YouTube: title (70 chars max, keyword-first) + description (first 150 chars must hook, then timestamps placeholder, then tags).\n\nAfter platform posts:\n- 3 hashtag sets (general / niche / brand-specific)\n- Optimal posting times per platform (day + time, audience: EU + US mix)\n- Blotato scheduling notes: which of the 22 Blotato accounts to use per platform, suggested template IDs if applicable (reference brand: {{brand}})',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      content_title: { type: 'string', label: 'Content title', required: true },
      content_summary: { type: 'string', label: 'Content summary (2–5 sentences)', required: true },
      platforms: { type: 'string', label: 'Platforms (twitter / linkedin / instagram / tiktok / youtube)', required: true },
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

  // ── Trelexa Hub — Presentations & Docs ───────────────────────────────────
  {
    slug: 'trelexa-pitch-deck-brand',
    name: '[Trelexa] Branded Pitch Deck',
    description: 'Create a 12-slide branded pitch deck outline with speaker notes for any portfolio brand.',
    category: 'trelexa',
    icon: 'presentation',
    agentTeamJson: ['researcher', 'copywriter', 'designer', 'editor'],
    defaultPrompt:
      'Create a branded pitch deck for the {{brand}} brand.\n\nBrand: {{brand}}\nAudience: {{audience}} (investors / clients / partners)\nKey metrics: {{key_metrics}}\nAsk or offer: {{ask_offer}}\n\nOutput a 12-slide outline with speaker notes for each slide:\n1. Title slide — brand name, tagline, presenter name, date\n2. Problem — the pain point the brand solves, backed by a data point\n3. Solution — what the brand offers, one-liner + 3 bullet elaborations\n4. Market size — TAM / SAM / SOM with sources\n5. Product demo screenshots — describe 2–3 key UI/product moments with visual directions\n6. Traction & metrics — {{key_metrics}} formatted as achievement callouts\n7. Team — key roles, credentials, why this team\n8. Business model — revenue streams, pricing tiers, unit economics\n9. Competitive landscape — 2x2 matrix (axes: price vs capability) with 4–6 competitors placed\n10. Roadmap — 3–4 milestones over 12 months, visual timeline format\n11. Financials — 3-year revenue projection table (conservative / base / optimistic)\n12. CTA — the ask ({{ask_offer}}), what happens next, contact info\n\nFor each slide: [Slide X — Title] → headline copy, 3–5 bullet points or layout notes, speaker notes (2–4 sentences).\n\nTone: authoritative, data-driven, concise. Tailor language to {{audience}}.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      audience: { type: 'string', label: 'Audience (investors / clients / partners)', required: true },
      key_metrics: { type: 'string', label: 'Key metrics to highlight (e.g. MRR, users, growth rate)', required: true },
      ask_offer: { type: 'string', label: 'Ask or offer (e.g. raising €500k, proposing a retainer)', required: true },
    },
  },
  {
    slug: 'trelexa-business-plan',
    name: '[Trelexa] Business Plan Generator',
    description: 'Generate a full business plan document for a brand or new venture with 3-year financial projections.',
    category: 'trelexa',
    icon: 'file-text',
    agentTeamJson: ['researcher', 'analyst', 'copywriter', 'editor'],
    defaultPrompt:
      'Generate a business plan document for the following brand or venture.\n\nBrand / venture name: {{brand_name}}\nIndustry: {{industry}}\nTarget market: {{target_market}}\nRevenue model: {{revenue_model}}\nCurrent stage: {{current_stage}} (idea / pre-revenue / early revenue / scaling)\n\nDeliver a structured business plan with the following sections:\n\n1. Executive Summary (300 words max) — vision, mission, what the business does, target market, current traction, funding ask if applicable\n2. Market Analysis — market size (TAM/SAM/SOM), key trends, regulatory environment, customer segments\n3. Competitive Landscape — top 5 competitors, positioning matrix, our differentiation\n4. Product / Service Description — what we sell, how it works, key features, IP or proprietary elements\n5. Go-to-Market Strategy — channels (organic, paid, partnerships, direct), launch sequence, pricing strategy\n6. Financial Projections (3-Year) — revenue table (Year 1 / Year 2 / Year 3) with assumptions, cost structure, break-even estimate, burn rate if pre-revenue\n7. Team Requirements — key hires needed, roles, ideal profiles\n8. Funding Needs — amount, use of funds breakdown (table), expected milestones unlocked\n\nFormat each section with a header and structured body. Use tables for financials and competitive matrix. Tone: professional, investor-ready.',
    paramsSchema: {
      brand_name: { type: 'string', label: 'Brand or venture name', required: true },
      industry: { type: 'string', label: 'Industry (e.g. biotech, SaaS, CPG supplements)', required: true },
      target_market: { type: 'string', label: 'Target market description', required: true },
      revenue_model: { type: 'string', label: 'Revenue model (e.g. SaaS subscription, B2B services, DTC ecommerce)', required: true },
      current_stage: { type: 'string', label: 'Current stage (idea / pre-revenue / early revenue / scaling)', required: true },
    },
  },
  {
    slug: 'trelexa-case-study',
    name: '[Trelexa] Client Case Study',
    description: 'Write a formatted client success story / case study with results, testimonial placeholder, and CTA.',
    category: 'trelexa',
    icon: 'award',
    agentTeamJson: ['copywriter', 'editor'],
    defaultPrompt:
      'Write a client case study for a Trelexa Hub brand.\n\nClient name: {{client_name}}\nIndustry: {{industry}}\nChallenge: {{challenge}}\nSolution provided: {{solution}}\nResults (metrics): {{results}}\n\nDeliver a fully formatted case study:\n\n1. Headline — outcome-first, includes client name and a specific metric (e.g. "How [Client] Reduced Recall Risk by 40% with Qalitex")\n2. Executive Summary (80 words max) — problem → solution → result in 3 sentences\n3. The Challenge — 2 paragraphs describing the client\'s situation before engagement, the specific pain points, and what was at stake\n4. The Solution — 2 paragraphs describing what was implemented, why it was the right approach, key steps or phases\n5. The Results — bullet list of 4–6 specific outcomes with numbers from {{results}}; include a before/after comparison where possible\n6. Testimonial Placeholder — [QUOTE: {client_name} testimonial about the outcome and experience — request from client]\n7. CTA — 2-sentence closing with link placeholder [CTA LINK] encouraging similar companies to get in touch\n\nTone: authoritative, specific, benefit-focused. Third-person throughout. Length: 600–800 words.',
    paramsSchema: {
      client_name: { type: 'string', label: 'Client name', required: true },
      industry: { type: 'string', label: 'Client industry', required: true },
      challenge: { type: 'string', label: 'Challenge the client faced', required: true },
      solution: { type: 'string', label: 'Solution provided', required: true },
      results: { type: 'string', label: 'Results with specific metrics', required: true },
    },
  },

  // ── Trelexa Hub — ICP & Client Profiling ──────────────────────────────────
  {
    slug: 'trelexa-icp-builder',
    name: '[Trelexa] ICP Builder',
    description: 'Build a detailed Ideal Customer Profile for a brand\'s service with outreach channel recommendations.',
    category: 'trelexa',
    icon: 'users',
    agentTeamJson: ['researcher', 'analyst', 'copywriter'],
    defaultPrompt:
      'Build an Ideal Customer Profile (ICP) for the following brand and service.\n\nBrand: {{brand}}\nService offered: {{service}}\nCurrent best clients (optional): {{best_clients}}\n\nDeliver a comprehensive ICP document with the following sections:\n\n1. Demographic Profile — age range, gender split, education level, job title patterns, seniority level\n2. Firmographic Profile — industry verticals (primary + secondary), company size (employees), annual revenue range, geography (EU / US / global), company stage (startup / growth / enterprise)\n3. Psychographic Triggers — core motivations for buying, professional ambitions, fears and risks they manage, how they measure success\n4. Buying Signals — specific events that indicate they\'re ready to buy (e.g. funding rounds, regulatory changes, product launches, hiring signals)\n5. Pain Points — top 5 pain points ranked by severity; for each: what it costs them (time, money, reputation)\n6. Objection Map — top 5 objections to buying + recommended responses\n7. Where They Hang Out Online — specific communities (LinkedIn groups, Slack channels, subreddits, newsletters, conferences)\n8. Recommended Outreach Channels — ranked list (LinkedIn cold outreach / Instantly cold email / content SEO / paid / partnerships) with rationale for each\n\nFormat: use headers and bullet points. End with a one-paragraph ICP summary suitable for briefing a sales rep.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      service: { type: 'string', label: 'Service or product offering', required: true },
      best_clients: { type: 'string', label: 'Current best clients (names or descriptions, optional)', required: false },
    },
  },
  {
    slug: 'trelexa-client-onboarding-packet',
    name: '[Trelexa] Client Onboarding Packet',
    description: 'Generate a complete client onboarding packet: welcome email, timeline, checklist, and 30-day plan.',
    category: 'trelexa',
    icon: 'clipboard',
    agentTeamJson: ['copywriter', 'analyst', 'editor'],
    defaultPrompt:
      'Generate a client onboarding packet for a new client.\n\nClient name: {{client_name}}\nService purchased: {{service_purchased}}\nBrand managing the account: {{managing_brand}} (trelexa / qalitex / theosym / care-europe)\n\nDeliver the following onboarding assets:\n\n1. Welcome Email — subject line + body (200 words max); warm, professional; confirms what they bought, what happens next, and who their point of contact is\n2. Timeline & Expectations — week-by-week overview of the first 6 weeks: what we deliver, what we need from the client, key milestones\n3. Deliverables Checklist — complete list of all deliverables for {{service_purchased}}, formatted as a tickbox checklist with estimated delivery dates (relative to start date: Day 1, Week 2, etc.)\n4. Access Requirements — list of accounts/credentials needed from the client (social accounts, CMS access, Google Analytics, ad accounts, brand assets); format as a table with: Item | Why We Need It | Urgency (Day 1 / Week 1 / Week 2)\n5. Communication Cadence — meeting schedule (weekly sync / monthly review / ad-hoc), preferred communication channels, response time SLAs\n6. First 30-Day Plan — specific action items per week (Week 1 / Week 2 / Week 3 / Week 4), owner for each item (us or client), success criteria\n\nTone: professional, organised, confidence-inspiring.',
    paramsSchema: {
      client_name: { type: 'string', label: 'Client name', required: true },
      service_purchased: { type: 'string', label: 'Service purchased (e.g. PR retainer, SEO package, content management)', required: true },
      managing_brand: { type: 'string', label: 'Brand managing the account (trelexa / qalitex / theosym / care-europe)', required: true },
    },
  },
  {
    slug: 'trelexa-prospect-research',
    name: '[Trelexa] Prospect Deep Research',
    description: 'Deep-research a specific prospect before outreach with personalised conversation starters.',
    category: 'trelexa',
    icon: 'search',
    agentTeamJson: ['researcher', 'analyst', 'copywriter'],
    defaultPrompt:
      'Deep-research a specific prospect before outreach.\n\nPerson name: {{person_name}}\nCompany: {{company}}\nRole: {{role}}\nLinkedIn URL (optional): {{linkedin_url}}\n\nResearch and output the following sections:\n\n1. Company Overview — what the company does, size, stage, revenue (estimated), key products/services, recent news (last 90 days)\n2. Recent News & Signals — funding rounds, product launches, partnerships, regulatory events, press mentions; flag the most outreach-relevant signal\n3. Tech Stack — known tools and platforms the company uses (sourced from job listings, G2, BuiltWith data)\n4. Competitors — top 3 competitors with a one-line differentiation note\n5. Prospect Background — {{person_name}}\'s career history summary, tenure at {{company}}, LinkedIn activity themes, areas of public expertise\n6. Mutual Connections — list any known mutual connections or shared affiliations (conferences, groups, publications); if none known, flag "check LinkedIn"\n7. 3 Personalised Conversation Starters — each one references a specific finding from the research above; written as the first sentence of a cold email or LinkedIn message (natural, no fluff, under 25 words each)\n8. Recommended Approach — which outreach channel to use first (cold email via Instantly / LinkedIn via AimFox / content engagement first), reasoning, and suggested timing\n\nFlag confidence level (High / Medium / Low) for each section based on data availability.',
    paramsSchema: {
      person_name: { type: 'string', label: 'Prospect full name', required: true },
      company: { type: 'string', label: 'Company name', required: true },
      role: { type: 'string', label: 'Prospect\'s role / title', required: true },
      linkedin_url: { type: 'string', label: 'LinkedIn URL (optional)', required: false },
    },
  },

  // ── Trelexa Hub — Visual & Diagrams ──────────────────────────────────────
  {
    slug: 'trelexa-svg-diagram',
    name: '[Trelexa] SVG Diagram Generator',
    description: 'Generate clean SVG code for flowcharts, architectures, process diagrams, timelines, or comparison charts with Cowork-Claw brand colours.',
    category: 'trelexa',
    icon: 'git-branch',
    agentTeamJson: ['designer', 'copywriter'],
    defaultPrompt:
      'Generate a clean SVG diagram.\n\nDiagram type: {{diagram_type}} (flowchart / architecture / process / comparison / timeline)\nTitle: {{title}}\nElements (comma-separated): {{elements}}\nStyle: {{style}} (minimal / corporate / playful)\n\nOutput requirements:\n- Valid, self-contained SVG code ready to paste into an HTML file or open directly in a browser\n- viewBox="0 0 800 600" (adjust height if needed for content)\n- Accent colour: #e26f03 (Cowork-Claw gold) — use for primary nodes, key connectors, or highlighted elements\n- Neutral palette: #1a1a1a (text), #f5f5f5 (background), #d0d0d0 (secondary lines)\n- All text readable at 1x scale (min font-size: 13px)\n- No animations, no JavaScript, no external dependencies\n- Proper text labels on all nodes/elements\n- PNG-ready layout: clean whitespace, no elements cut off\n\nDiagram-type specifics:\n- flowchart: rectangular nodes with rounded corners, diamond decision nodes, directional arrows\n- architecture: layered boxes with component labels, dashed boundary lines for system scopes\n- process: numbered steps in a horizontal or vertical flow, milestone markers\n- comparison: 2-column or 2x2 matrix layout, clear axis labels\n- timeline: horizontal or vertical timeline, date/period markers, event descriptions\n\nAfter the SVG code block, add a brief "Usage notes" section: recommended dimensions for web vs print, any suggested edits to personalise the diagram.',
    paramsSchema: {
      diagram_type: { type: 'string', label: 'Diagram type (flowchart / architecture / process / comparison / timeline)', required: true },
      title: { type: 'string', label: 'Diagram title', required: true },
      elements: { type: 'string', label: 'Elements / nodes (comma-separated)', required: true },
      style: { type: 'string', label: 'Style (minimal / corporate / playful)', required: false },
    },
  },
  {
    slug: 'trelexa-infographic-outline',
    name: '[Trelexa] Infographic Outline',
    description: 'Design an infographic structure with data visualisation plan, chart recommendations, and copy per section.',
    category: 'trelexa',
    icon: 'bar-chart-2',
    agentTeamJson: ['designer', 'copywriter', 'analyst'],
    defaultPrompt:
      'Design an infographic outline with a data visualisation plan.\n\nTopic: {{topic}}\nKey data points: {{data_points}} (5–8 data points separated by semicolons)\nTarget audience: {{target_audience}}\nBrand: {{brand}}\n\nDeliver the following:\n\n1. Infographic Structure — section-by-section breakdown:\n   - Header: title (max 10 words), subtitle (max 20 words), brand logo placeholder\n   - Data Blocks (one per data point): statistic/fact, supporting sentence (max 15 words), visual recommendation (see below)\n   - CTA Footer: one-sentence CTA + URL placeholder\n2. Chart / Visual Recommendations — for each data point, recommend the most appropriate visualisation type (bar chart, donut chart, icon array, stat callout, comparison table, timeline, map) with a brief rationale\n3. Colour Palette — pull from {{brand}} brand guidelines:\n   - Qalitex: navy #1a2e4a, clinical white #f8f9fa, accent teal #00a8a8\n   - TheoSym: deep purple #2d1b69, electric blue #0066ff, white\n   - Trelexa: charcoal #2c2c2c, gold #c9a84c, white\n   - Care Europe: EU blue #003399, medical green #00a550, white\n   - Nourify: warm green #4caf50, cream #fafaf0, amber #ff8f00\n   - Sam Sammane / generic: Cowork-Claw gold #e26f03, dark #1a1a1a, white\n4. Copy for Each Section — headline + data label text, final copy-edited\n5. Dimensions:\n   - Social (Instagram/LinkedIn): 1080×1920 px\n   - Blog embed: 800×2000 px\n   Note any layout differences between the two sizes.',
    paramsSchema: {
      topic: { type: 'string', label: 'Infographic topic', required: true },
      data_points: { type: 'string', label: 'Key data points (5–8, separated by semicolons)', required: true },
      target_audience: { type: 'string', label: 'Target audience', required: true },
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
    },
  },

  // ── Trelexa Hub — Meetings & Operations ──────────────────────────────────
  {
    slug: 'trelexa-meeting-agenda',
    name: '[Trelexa] Meeting Agenda',
    description: 'Create a structured timed meeting agenda with objectives, decision items, and action item template.',
    category: 'trelexa',
    icon: 'calendar',
    agentTeamJson: ['copywriter', 'analyst'],
    defaultPrompt:
      'Create a structured meeting agenda.\n\nMeeting type: {{meeting_type}} (client kickoff / weekly sync / quarterly review / strategy session)\nAttendees: {{attendees}}\nTopics: {{topics}}\nTotal duration: {{duration}} minutes\n\nDeliver a complete agenda document:\n\n1. Meeting Header — title, date placeholder, time + timezone placeholder, location/link placeholder, facilitator (first name from {{attendees}})\n2. Meeting Objectives — 2–3 clear, outcome-focused objectives (what decisions or outputs should exist by the end)\n3. Timed Agenda — allocate the full {{duration}} minutes across items. Format: | Time | Item | Owner | Type (discuss/decide/update/breakout) |\n   - Always include: Welcome & intros (5 min), Wrap-up & next steps (5 min), any mandatory items for the meeting type\n   - client kickoff: scope alignment, access checklist review, communication norms, quick wins\n   - weekly sync: wins, blockers, priorities, metric review\n   - quarterly review: OKR scoring, lessons, next quarter planning\n   - strategy session: context setting, problem framing, options generation, decision\n4. Decision Items — a pre-populated list of decisions that need to be made in this meeting\n5. Action Items Template — table: | Action | Owner | Due Date | Notes |\n6. Pre-Read List — 2–4 documents or data points attendees should review before the meeting\n\nTone: crisp, professional, time-respectful.',
    paramsSchema: {
      meeting_type: { type: 'string', label: 'Meeting type (client kickoff / weekly sync / quarterly review / strategy session)', required: true },
      attendees: { type: 'string', label: 'Attendees (names + roles)', required: true },
      topics: { type: 'string', label: 'Topics to cover', required: true },
      duration: { type: 'string', label: 'Total duration in minutes (e.g. 30, 60, 90)', required: true },
    },
  },
  {
    slug: 'trelexa-meeting-minutes',
    name: '[Trelexa] Meeting Minutes',
    description: 'Convert rough meeting notes into formatted minutes with decisions, action items, and a follow-up email draft.',
    category: 'trelexa',
    icon: 'edit-3',
    agentTeamJson: ['copywriter', 'analyst', 'editor'],
    defaultPrompt:
      'Convert rough meeting notes into formatted meeting minutes.\n\nMeeting title: {{meeting_title}}\nDate: {{meeting_date}}\nAttendees: {{attendees}}\nRaw notes: {{raw_notes}}\n\nDeliver the following formatted output:\n\n1. Meeting Minutes Header — title, date, attendees, facilitator, scribe placeholder\n2. Decisions Made — bullet list of all decisions reached during the meeting; each decision: bold statement, one-sentence rationale if noted in the raw notes\n3. Action Items — table: | # | Action Item | Owner | Due Date | Priority (High/Med/Low) |\n   — extract all explicit action items from the raw notes; flag any items where owner or due date is unclear with [TBC]\n4. Key Discussion Points — 4–8 bullet points summarising the main topics discussed (not every detail, just the substance)\n5. Next Meeting — placeholder: [Date TBC], [Agenda preview based on open action items]\n6. Follow-Up Email Draft — a send-ready email the facilitator can send to all attendees:\n   - Subject: "Minutes + Actions — {{meeting_title}} ({{meeting_date}})"\n   - Body: brief recap (3 sentences), decisions bullet list, action items table, next meeting note\n   - Tone: professional, clear, under 250 words\n\nFormat the minutes for easy scanning (headers, tables, bullets). Correct any grammar in the raw notes without changing meaning.',
    paramsSchema: {
      meeting_title: { type: 'string', label: 'Meeting title', required: true },
      meeting_date: { type: 'string', label: 'Meeting date (e.g. 2026-04-14)', required: true },
      attendees: { type: 'string', label: 'Attendees (names + roles)', required: true },
      raw_notes: { type: 'string', label: 'Raw meeting notes (paste freely, any format)', required: true },
    },
  },
  {
    slug: 'trelexa-weekly-ops-report',
    name: '[Trelexa] Weekly Ops Report',
    description: 'Generate the weekly operations report across all portfolio brands with traffic-light status and priorities.',
    category: 'trelexa',
    icon: 'trending-up',
    agentTeamJson: ['analyst', 'copywriter', 'editor'],
    defaultPrompt:
      'Generate the weekly operations report across all portfolio brands.\n\nBrand updates (bullet points per brand): {{brand_updates}}\nKey metrics this week: {{key_metrics}}\nBlockers: {{blockers}}\n\nDeliver a structured weekly ops report:\n\n1. Executive Summary (150 words max) — overall portfolio health, top 3 highlights, top 1–2 concerns\n2. Per-Brand Status — for each brand mentioned in {{brand_updates}} (Qalitex, TheoSym, Trelexa, Care Europe, Nourify, Sam Sammane, QGI, Cowork-Claw, AimFox, Instantly):\n   - Status: 🟢 On Track / 🟡 At Risk / 🔴 Blocked\n   - 2–3 bullet updates from the brand_updates input\n   - One sentence on next week\'s priority\n3. Metrics Dashboard — table of {{key_metrics}} formatted as: | Metric | This Week | Last Week | Delta | Trend |\n4. Content Published This Week — bullet list of blog posts, press releases, or social campaigns launched\n5. Outreach Stats — Instantly campaigns active, emails sent, reply rate; AimFox connections sent, acceptance rate\n6. Revenue Update — any new deals, renewals, or revenue events from the updates\n7. Blockers & Escalations — from {{blockers}}: for each blocker, format as: Blocker | Brand | Impact | Owner | Proposed Resolution\n8. Priorities Next Week — top 5 cross-portfolio priorities, ranked\n\nFormat: markdown with clear section headers. Traffic-light emojis for brand status. Keep language concise and factual.',
    paramsSchema: {
      brand_updates: { type: 'string', label: 'Brand updates — paste bullet points per brand', required: true },
      key_metrics: { type: 'string', label: 'Key metrics this week (paste as-is)', required: true },
      blockers: { type: 'string', label: 'Blockers or risks (one per line)', required: false },
    },
  },

  // ── Trelexa Hub — Campaigns & Outreach ───────────────────────────────────
  {
    slug: 'trelexa-instantly-campaign',
    name: '[Trelexa] Instantly Campaign Designer',
    description: 'Design a complete Instantly cold email campaign with 3-email sequence, lead list criteria, and scheduling config.',
    category: 'trelexa',
    icon: 'send',
    agentTeamJson: ['copywriter', 'analyst', 'editor'],
    defaultPrompt:
      'Design a complete Instantly cold email campaign.\n\nCampaign name: {{campaign_name}}\nTrigger event: {{trigger_event}}\nTarget vertical: {{target_vertical}} (supplements / cosmetics / food)\nProspect risk description: {{prospect_risk}}\nSending account: {{sending_account}} (alex / aria / kelly / lily / marry @qalitex-lab.com)\n\nDeliver the following campaign assets:\n\n1. 3-Email Sequence — strict rules for every email:\n   - Pure plain text, zero HTML, zero links, zero images\n   - Under 80 words per email body (not counting subject line)\n   - Subject line must look forwarded or colleague-sent (e.g. "Fwd: re: the {{trigger_event}}" or "quick heads up")\n   - No company name, no logo, no CTA buttons\n   - No links of any kind\n   - Tone: peer-to-peer, genuine concern, zero sales language\n   - Variables to use: {{trigger}}, {{triggerDetail}}, {{productCategory}}, {{risk}}\n   Email 1 (Day 0): alert to the trigger event and its direct risk; end with a soft open-ended question\n   Email 2 (Day 3): one specific consequence or data point; lightly references Email 1\n   Email 3 (Day 7): final check-in; acknowledge they\'re busy; one clear next step framed as a favour\n   Format each as: [Subject] / [Body]\n\n2. Lead List Criteria for SuperSearch — ICP filters:\n   - Industries to target (based on {{target_vertical}})\n   - Job titles to include (decision-makers, quality/regulatory/procurement)\n   - Company size range\n   - Geography (default: US + EU)\n   - Keywords to search\n   - Exclusion filters\n\n3. Campaign Variables Reference — define what each variable maps to for this specific campaign:\n   {{trigger}}, {{triggerDetail}}, {{productCategory}}, {{risk}}\n\n4. Scheduling Config:\n   - Sending account: {{sending_account}}@qalitex-lab.com\n   - Send days: Monday–Friday\n   - Send window: 8:00 AM – 4:00 PM Pacific\n   - Daily send limit: recommend based on account warmup stage (new / warmed / seasoned)\n   - Follow-up spacing: as per sequence above',
    paramsSchema: {
      campaign_name: { type: 'string', label: 'Campaign name', required: true },
      trigger_event: { type: 'string', label: 'Trigger event (e.g. FDA recall, contamination news, regulatory change)', required: true },
      target_vertical: { type: 'string', label: 'Target vertical (supplements / cosmetics / food)', required: true },
      prospect_risk: { type: 'string', label: 'How this trigger risks the prospect\'s business', required: true },
      sending_account: { type: 'string', label: 'Sending account (alex / aria / kelly / lily / marry)', required: true },
    },
  },
  {
    slug: 'trelexa-aimfox-linkedin-campaign',
    name: '[Trelexa] AimFox LinkedIn Campaign',
    description: 'Design a LinkedIn outreach campaign for AimFox automation with connection message, follow-up sequence, and prospect criteria.',
    category: 'trelexa',
    icon: 'linkedin',
    agentTeamJson: ['copywriter', 'researcher', 'analyst'],
    defaultPrompt:
      'Design a LinkedIn outreach campaign for AimFox automation.\n\nBrand: {{brand}}\nTarget persona — title: {{target_title}}, industry: {{target_industry}}\nCampaign goal: {{campaign_goal}} (connect / engage / pitch)\nConnection message angle: {{connection_angle}}\nFollow-up goal: {{followup_goal}}\n\nDeliver the following AimFox campaign assets:\n\n1. Connection Request Message (300 characters max):\n   - Personalised, references their role or industry\n   - No pitch, no links\n   - Ends with a natural reason to connect\n   - Angle: {{connection_angle}}\n\n2. Follow-Up Sequence (3 messages):\n   Message 1 (Day 1 after connection accepted):\n   - Thank for connecting, add value immediately (insight, resource, or observation)\n   - Under 100 words, no pitch\n   Message 2 (Day 3):\n   - Soft bridge from value to {{brand}}\'s relevance\n   - Under 120 words\n   - Soft CTA: ask a question or propose a quick call\n   Message 3 (Day 7):\n   - Follow up on Message 2 if no reply\n   - Under 80 words\n   - Clear but non-pushy CTA\n\n3. Profile View Strategy — recommended profiles to view before sending connection request (company type, seniority level) to warm up the sequence\n\n4. Content Engagement Plan — 3 content engagement touchpoints before or alongside outreach:\n   - What type of posts to like/comment on (topics relevant to {{target_industry}})\n   - Comment templates (2 options) that establish credibility without being promotional\n\n5. Prospect Filtering Criteria for AimFox:\n   - Job titles (include list)\n   - Industries (include list)\n   - Geography\n   - Company size\n   - Exclusion filters (competitors, current clients, irrelevant roles)\n   - Estimated audience size\n\nTone: human, peer-to-peer, no corporate speak.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand running the campaign', required: true },
      target_title: { type: 'string', label: 'Target job title(s)', required: true },
      target_industry: { type: 'string', label: 'Target industry', required: true },
      campaign_goal: { type: 'string', label: 'Campaign goal (connect / engage / pitch)', required: true },
      connection_angle: { type: 'string', label: 'Connection message angle (e.g. shared industry interest, mutual connection, recent news)', required: true },
      followup_goal: { type: 'string', label: 'Follow-up goal (e.g. book a discovery call, share a resource)', required: true },
    },
  },

  // ── Trelexa Hub — Video & Multimedia ─────────────────────────────────────
  {
    slug: 'trelexa-video-script',
    name: '[Trelexa] Video Script',
    description: 'Write a full video script for YouTube, TikTok, or Instagram Reels with hook, B-roll notes, CTA, and thumbnail concept.',
    category: 'trelexa',
    icon: 'video',
    agentTeamJson: ['copywriter', 'designer', 'editor'],
    defaultPrompt:
      'Write a video script for the following brand and platform.\n\nBrand: {{brand}}\nPlatform: {{platform}} (youtube-long / youtube-short / tiktok / instagram-reel)\nTopic: {{topic}}\nDuration: {{duration}} (30s / 60s / 3min / 10min)\nCTA: {{cta}}\n\nDeliver a complete production-ready script:\n\n1. Hook (first 3 seconds) — the one line that stops the scroll; for YouTube: bold statement or curiosity gap; for TikTok/Reels: action-first or shock value; for YouTube-short: pattern interrupt\n\n2. Script Body — formatted as: [SPOKEN] dialogue | [B-ROLL] visual direction | [ON-SCREEN TEXT] overlay copy\n   - Break into sections appropriate for {{duration}}\n   - youtube-long (10min): 4–6 sections with clear transitions\n   - youtube-short / 60s: 3 sections (hook → body → CTA)\n   - tiktok / instagram-reel: 2–3 tight sections\n   - Include specific B-roll directions (not vague — e.g. "[B-ROLL: close-up of supplement label being turned over]")\n   - On-screen text overlays: include exact copy for lower-thirds and emphasis callouts\n\n3. CTA Placement — where {{cta}} appears in the script (mid-roll and/or end), exact spoken line, and any on-screen CTA graphic direction\n\n4. Thumbnail Concept — describe the ideal thumbnail: foreground subject, background, text overlay (max 4 words), emotion/expression, colour contrast notes\n\n5. Description + Hashtags:\n   - First 150 chars (what appears before "more"): keyword-rich hook\n   - Timestamps (for youtube-long: fill in; for others: N/A)\n   - 5–10 hashtags relevant to {{brand}} and {{topic}}\n\nTone: native to {{platform}}. Avoid stiff corporate language.',
    paramsSchema: {
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      platform: { type: 'string', label: 'Platform (youtube-long / youtube-short / tiktok / instagram-reel)', required: true },
      topic: { type: 'string', label: 'Video topic', required: true },
      duration: { type: 'string', label: 'Duration (30s / 60s / 3min / 10min)', required: true },
      cta: { type: 'string', label: 'Call to action (e.g. subscribe, visit website, book a call)', required: true },
    },
  },
  {
    slug: 'trelexa-video-edit-brief',
    name: '[Trelexa] Video Editing Brief (Gemini + Claude CLI)',
    description: 'Create a video editing brief combining Gemini CLI for visual analysis and Claude CLI for script/copy refinement.',
    category: 'trelexa',
    icon: 'film',
    agentTeamJson: ['designer', 'copywriter', 'analyst', 'editor'],
    defaultPrompt:
      'Create a video editing brief that combines Gemini CLI (visual analysis) and Claude CLI (script/copy refinement).\n\nRaw footage description: {{footage_description}}\nTarget platform: {{platform}} (youtube-long / youtube-short / tiktok / instagram-reel)\nBrand: {{brand}}\nDesired style: {{style}} (e.g. documentary, fast-cut, talking-head, product demo, vlog)\n\nDeliver a complete dual-CLI editing brief:\n\n## GEMINI CLI TASKS (Visual Analysis & Suggestions)\nInstructions for running Gemini CLI on the raw footage:\n- Frame analysis prompts: what to look for in key frames (lighting quality, brand colours present, talking-head framing, product visibility)\n- Scene selection guidance: which types of shots to prioritise for the edit\n- Visual quality flags: what Gemini should identify and reject (shaky footage, bad exposure, off-brand visuals)\n- Colour grading reference: brand colours for {{brand}} to match\n\n## CLAUDE CLI TASKS (Script & Copy Refinement)\nInstructions for running Claude CLI on the script/transcript:\n- Hook refinement: rewrite the first 3 seconds for maximum retention\n- Pacing notes: flag sections that run long or slow\n- On-screen text copy: generate or refine overlay text for each section\n- CTA copy: optimise the call to action for {{platform}}\n\n## EDITING TIMELINE\nFormatted as: | Timestamp | Section | Duration | Visual Direction | Audio/Spoken | On-Screen Text | Transition |\n- Intro (0:00–0:XX): hook + brand intro\n- Body sections (based on {{style}} and {{platform}})\n- Outro (last 5–10 sec): CTA + end screen\n\n## POST-PRODUCTION NOTES\n- Music mood: describe the energy and genre that fits {{style}} and {{brand}}\n- Colour grading: brand colour reference with hex codes, mood direction\n- Export settings per platform:\n  - youtube-long: 1920×1080, H.264, 24fps, stereo audio 48kHz\n  - youtube-short / tiktok / instagram-reel: 1080×1920, H.264, 30fps\n\n## THUMBNAIL VARIANTS\n3 thumbnail concepts: | Variant | Foreground | Background | Text Overlay (max 4 words) | Emotion/Hook |\n\nNote any footage gaps where additional B-roll or graphics will be needed.',
    paramsSchema: {
      footage_description: { type: 'string', label: 'Raw footage description (what was filmed, approximate clips)', required: true },
      platform: { type: 'string', label: 'Target platform (youtube-long / youtube-short / tiktok / instagram-reel)', required: true },
      brand: { type: 'string', label: 'Brand (qalitex / theosym / trelexa / care-europe / nourify / sam-sammane)', required: true },
      style: { type: 'string', label: 'Desired edit style (e.g. documentary, fast-cut, talking-head, product demo)', required: true },
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
          ${(t.category === 'internal' || t.category === 'trelexa') ? 'gemini' : 'claude'}
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
