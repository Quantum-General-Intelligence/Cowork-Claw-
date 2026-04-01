export interface ModuleInfo {
  slug: string
  name: string
  shortDescription: string
  description: string
  icon: 'Server' | 'Globe' | 'Layers' | 'Workflow'
  repoUrl: string
  status: 'active' | 'preview' | 'experimental'
  tags: string[]
  features: string[]
}

export const MODULES: ModuleInfo[] = [
  {
    slug: 'vercel-openclaw',
    name: 'OpenClaw Control Plane',
    shortDescription: 'AI agent runtime & sandbox lifecycle',
    description:
      'Full control plane for managing a Vercel Sandbox running OpenClaw. Provides sandbox create/restore, snapshot management, egress firewall learning, and durable channel integrations for Slack and Telegram.',
    icon: 'Server',
    repoUrl: 'https://github.com/vercel-labs/vercel-openclaw',
    status: 'preview',
    tags: ['sandbox', 'runtime', 'admin'],
    features: [
      'Sandbox lifecycle management',
      'Snapshot & restore',
      'Egress firewall learning',
      'Slack & Telegram channels',
      'Cron job persistence',
      'WebSocket gateway proxy',
    ],
  },
  {
    slug: 'agent-browser',
    name: 'Agent Browser',
    shortDescription: 'Native browser automation for AI agents',
    description:
      'Fast native Rust CLI for browser automation targeting AI agents. Uses semantic locators (ARIA roles, text, labels) and element references for reliable interaction. Supports screenshots, snapshots, network recording, and session persistence.',
    icon: 'Globe',
    repoUrl: 'https://github.com/vercel-labs/agent-browser',
    status: 'active',
    tags: ['browser', 'automation', 'cli'],
    features: [
      'Semantic element locators',
      'Annotated screenshots',
      'Accessibility tree snapshots',
      'Network recording & HAR export',
      'Session persistence',
      'Cross-platform binaries',
    ],
  },
  {
    slug: 'json-render',
    name: 'JSON Render',
    shortDescription: 'Generative UI from AI JSON specs',
    description:
      'Generative UI framework that transforms AI-generated JSON specs into real UI components. Supports guardrailed component catalogs, streaming rendering, and multi-platform output including React, Vue, Svelte, React Native, PDF, email, and video.',
    icon: 'Layers',
    repoUrl: 'https://github.com/vercel-labs/json-render',
    status: 'active',
    tags: ['ui', 'generative', 'rendering'],
    features: [
      'Guardrailed component catalogs',
      'Streaming JSON rendering',
      'Multi-platform renderers',
      '36 pre-built shadcn/ui components',
      'Dynamic props & state binding',
      'Code generation from specs',
    ],
  },
  {
    slug: 'workflow-builder',
    name: 'Workflow Builder',
    shortDescription: 'Visual drag-and-drop workflow canvas',
    description:
      'Visual workflow builder powered by React Flow with a plugin architecture for real integrations. Supports AI-powered workflow generation, code generation to TypeScript, and execution tracking with logs.',
    icon: 'Workflow',
    repoUrl: 'https://github.com/vercel-labs/workflow-builder-template',
    status: 'experimental',
    tags: ['workflow', 'visual', 'automation'],
    features: [
      'React Flow drag-and-drop canvas',
      'Plugin system for integrations',
      'AI workflow generation',
      'TypeScript code generation',
      'Execution tracking & logs',
      'Real integrations (Slack, GitHub, Linear, Stripe)',
    ],
  },
]

export function getModuleBySlug(slug: string): ModuleInfo | undefined {
  return MODULES.find((m) => m.slug === slug)
}
