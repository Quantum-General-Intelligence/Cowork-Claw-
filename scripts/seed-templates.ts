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
