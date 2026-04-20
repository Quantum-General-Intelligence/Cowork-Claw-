'use client'

import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { sessionAtom, sessionInitializedAtom } from '@/lib/atoms/session'
import { githubConnectionAtom, githubConnectionInitializedAtom } from '@/lib/atoms/github-connection'
import type { SessionUserInfo } from '@/lib/session/types'
import { createClient } from '@/utils/supabase/client'

export function SessionProvider() {
  const setSession = useSetAtom(sessionAtom)
  const setInitialized = useSetAtom(sessionInitializedAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const setGitHubInitialized = useSetAtom(githubConnectionInitializedAtom)

  useEffect(() => {
    const supabase = createClient()

    const fetchSession = async () => {
      try {
        const response = await fetch('/api/auth/info')
        const data: SessionUserInfo = await response.json()
        setSession({ user: data.user, authProvider: data.authProvider })
        setGitHubConnection({ connected: !!data.githubConnected })
        setInitialized(true)
        setGitHubInitialized(true)
      } catch (error) {
        console.error('Failed to fetch session:', error)
        setSession({ user: undefined })
        setGitHubConnection({ connected: false })
        setInitialized(true)
        setGitHubInitialized(true)
      }
    }

    fetchSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchSession()
      } else {
        setSession({ user: undefined })
        setGitHubConnection({ connected: false })
        setInitialized(true)
        setGitHubInitialized(true)
      }
    })

    const handleFocus = () => fetchSession()
    window.addEventListener('focus', handleFocus)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
    }
  }, [setSession, setInitialized, setGitHubConnection, setGitHubInitialized])

  return null
}
