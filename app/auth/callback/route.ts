import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { getOrCreateUser } from '@/lib/auth/get-or-create-user'
import { persistGitHubConnection } from '@/lib/auth/github-connection'
import { getUserPlan } from '@/lib/billing/check-subscription'
import { isSuperAdmin, isInternalTeam } from '@/lib/auth/super-admin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const searchParams = url.searchParams
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Use the host header to build the origin, not the internal Docker address
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const origin = `${proto}://${host}`

  if (code) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        try {
          const dbUser = await getOrCreateUser(user)

          // Capture provider OAuth tokens returned by the code exchange. These are
          // NOT persisted by Supabase, so this callback is our only window to
          // stash them. Today we only persist GitHub tokens (the one provider
          // whose API we call on the user's behalf), written to the accounts
          // table so primary sign-in and linkIdentity flows behave identically.
          const providerToken = exchangeData.session?.provider_token ?? null
          const providerRefreshToken = exchangeData.session?.provider_refresh_token ?? null
          const mostRecentProvider = user.app_metadata?.provider
          if (providerToken && mostRecentProvider === 'github') {
            try {
              await persistGitHubConnection({
                userId: dbUser.id,
                providerToken,
                providerRefreshToken,
                supabaseUser: user,
              })
            } catch (connectionError) {
              console.error('Failed to persist GitHub connection:', connectionError)
            }
          }

          if (isSuperAdmin(user.email) || isInternalTeam(user.email)) {
            cookieStore.set('_sub_status', 'active', {
              path: '/',
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 30,
            })
          } else {
            const plan = await getUserPlan(dbUser.id)
            const isActive = !!plan.stripeSubscriptionId && plan.status === 'active'
            cookieStore.set('_sub_status', isActive ? 'active' : 'inactive', {
              path: '/',
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60,
            })
          }
        } catch (error) {
          console.error('Failed to process user:', error)
        }
      }

      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/auth?error=callback_failed', origin))
}
