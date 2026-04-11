import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { getOrCreateUser } from '@/lib/auth/get-or-create-user'
import { getUserPlan } from '@/lib/billing/check-subscription'
import { isSuperAdmin } from '@/lib/auth/super-admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        try {
          const dbUser = await getOrCreateUser(user)

          if (isSuperAdmin(user.email)) {
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
