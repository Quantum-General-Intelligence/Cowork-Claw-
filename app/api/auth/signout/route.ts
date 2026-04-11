import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  await supabase.auth.signOut()

  cookieStore.delete('_sub_status')

  const next = req.nextUrl.searchParams.get('next') ?? '/'
  const url = isRelativeUrl(next) ? next : '/'

  return Response.json({ url })
}
