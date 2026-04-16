import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { isSuperAdmin } from '@/lib/auth/super-admin'

const PUBLIC_PREFIXES = ['/auth', '/api/auth', '/api/billing/webhook', '/api/waitlist', '/tutorial', '/onboarding']
const AUTH_ONLY_PREFIXES = ['/settings/billing', '/api/billing']

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const { response, user } = await updateSession(request)

  if (isPublic(pathname)) return response

  if (!user) {
    const authUrl = new URL('/auth', request.url)
    authUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(authUrl)
  }

  if (isSuperAdmin(user.email) || user.email?.endsWith('@qgi.dev')) return response

  if (isAuthOnly(pathname)) return response

  const subStatus = request.cookies.get('_sub_status')?.value
  if (subStatus !== 'active') {
    return NextResponse.redirect(new URL('/settings/billing', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
