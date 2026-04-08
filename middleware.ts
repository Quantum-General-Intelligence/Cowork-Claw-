import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { getSessionFromReq } from '@/lib/session/server'

const PUBLIC_PREFIXES = ['/api/auth', '/api/billing/webhook', '/api/waitlist', '/subscribe']
const AUTH_ONLY_PREFIXES = ['/settings/billing', '/api/billing']

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const supabaseResponse = await updateSession(request)

  if (isPublic(pathname)) return supabaseResponse

  const session = await getSessionFromReq(request)

  if (!session?.user) {
    const signInUrl = new URL('/api/auth/signin/github', request.url)
    signInUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(signInUrl)
  }

  if (isAuthOnly(pathname)) return supabaseResponse

  const subStatus = request.cookies.get('_sub_status')?.value
  if (subStatus !== 'active') {
    return NextResponse.redirect(new URL('/settings/billing', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
