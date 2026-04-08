'use client'

import { Button } from '@/components/ui/button'
import { PricingCards } from '@/components/pricing-cards'
import { ArrowRight, GitBranch, Terminal, Bot, GitPullRequest, Globe, Shield, Key } from 'lucide-react'
import Link from 'next/link'

const FEATURES = [
  {
    icon: Bot,
    title: 'Multi-Agent Orchestration',
    description: 'Claude, Codex, Copilot, Cursor, Gemini, and more — coordinated to tackle your task.',
  },
  {
    icon: GitBranch,
    title: 'GitHub Integration',
    description: 'Connect your repos, create branches, and manage code changes directly from the platform.',
  },
  {
    icon: Terminal,
    title: 'Live Sandboxes',
    description: 'Each task runs in an isolated Docker sandbox with a full development environment.',
  },
  {
    icon: GitPullRequest,
    title: 'Automated PRs',
    description: 'Agents push code, open pull requests, and respond to review comments automatically.',
  },
  {
    icon: Key,
    title: 'Bring Your Own Key',
    description: 'Use your own API keys for AI providers, or use ours — both included in every plan.',
  },
  {
    icon: Globe,
    title: 'Browser-Based IDE',
    description: 'File editor, terminal, diff viewer, and LSP — all in your browser, no local setup.',
  },
  {
    icon: Shield,
    title: 'Secure by Default',
    description: 'Encrypted credentials, isolated sandboxes, and scoped API keys for every session.',
  },
]

const AGENT_NAMES = ['Claude', 'Codex', 'Copilot', 'Cursor', 'Gemini', 'OpenCode', 'Pi']

function handlePricingSelect() {
  window.location.href = '/api/auth/signin/github'
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Nav */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight">Cowork-Claw</span>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <Link href="/api/auth/signin/github">
              <Button size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 sm:py-32 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Ship code with a team
            <br />
            <span className="text-primary">of AI agents</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            Describe what you want to build. Cowork-Claw orchestrates Claude, Codex, Copilot, Cursor, Gemini and more to
            get it done — sandboxed, with PRs and full git history.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            All plans include hosted sandbox execution and bring-your-own-key support.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/api/auth/signin/github">
              <Button size="lg" className="gap-2">
                Sign In with GitHub <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#pricing">
              <Button size="lg" variant="outline">
                View Plans
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Agent strip */}
      <section className="py-10 border-y bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Powered by</p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
            {AGENT_NAMES.map((name) => (
              <span key={name} className="text-sm font-medium text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">Everything you need to ship faster</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="space-y-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 bg-muted/30 border-y">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-lg mx-auto">
            Every plan includes hosted sandbox execution and bring-your-own-key support. No hidden fees.
          </p>
          <PricingCards onSelectPlan={handlePricingSelect} />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Cowork-Claw. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Quantum-General-Intelligence/Cowork-Claw-"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
