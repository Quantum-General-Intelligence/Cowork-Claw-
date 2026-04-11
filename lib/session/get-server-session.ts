import { cookies } from 'next/headers'
import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'
import { getOrCreateUser, mapSupabaseProvider } from '@/lib/auth/get-or-create-user'
import type { Session } from './types'

export const getServerSession = cache(async (): Promise<Session | undefined> => {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser()

  if (!supabaseUser) return undefined

  try {
    const dbUser = await getOrCreateUser(supabaseUser)
    return {
      created: Date.now(),
      authProvider: mapSupabaseProvider(supabaseUser.app_metadata.provider),
      user: {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email ?? undefined,
        avatar: dbUser.avatarUrl ?? '',
        name: dbUser.name ?? undefined,
      },
    }
  } catch (error) {
    console.error('Failed to get/create user:', error)
    return undefined
  }
})
