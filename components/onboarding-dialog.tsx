'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Github, MessageSquare, CheckCircle } from 'lucide-react'

interface OnboardingDialogProps {
  hasGithub: boolean
  hasRepo: boolean
}

const STEPS = [
  {
    title: 'Connect GitHub',
    description: 'Sign in with GitHub to access your repositories and create pull requests.',
    icon: Github,
    key: 'github',
  },
  {
    title: 'Start a conversation',
    description: 'Tell OpenClaw what you want to build. It will coordinate the right AI agents.',
    icon: MessageSquare,
    key: 'chat',
  },
]

export function OnboardingDialog({ hasGithub }: OnboardingDialogProps) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Show onboarding only if user hasn't dismissed it and hasn't connected GitHub
    const wasDismissed = localStorage.getItem('onboarding-dismissed')
    if (wasDismissed) {
      setDismissed(true)
      return
    }
    if (!hasGithub) {
      setOpen(true)
    }
  }, [hasGithub])

  const handleDismiss = () => {
    setOpen(false)
    setDismissed(true)
    localStorage.setItem('onboarding-dismissed', 'true')
  }

  if (dismissed) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Cowork-Claw</DialogTitle>
          <DialogDescription>Get started in two steps:</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {STEPS.map((step, i) => {
            const isComplete = step.key === 'github' && hasGithub
            const Icon = isComplete ? CheckCircle : step.icon
            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {isComplete ? <Icon className="h-4 w-4 text-green-500" /> : i + 1}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium">{step.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Skip
          </Button>
          <Button size="sm" onClick={handleDismiss}>
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
