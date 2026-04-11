'use client'

import { Button } from '@/components/ui/button'

export function SignIn() {
  return (
    <Button onClick={() => (window.location.href = '/auth')} variant="outline" size="sm">
      Sign in
    </Button>
  )
}
