import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { AuthProvider } from '@/lib/session/types'

export function mapSupabaseProvider(provider?: string): AuthProvider {
  switch (provider) {
    case 'github':
      return 'github'
    case 'google':
      return 'google'
    case 'email':
      return 'email'
    default:
      return 'email'
  }
}

export async function getOrCreateUser(supabaseUser: SupabaseUser) {
  const provider = mapSupabaseProvider(supabaseUser.app_metadata.provider)
  const externalId = supabaseUser.id

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.externalId, externalId)))
    .limit(1)

  if (existing) {
    await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
        email: supabaseUser.email ?? existing.email,
        name: supabaseUser.user_metadata.full_name || supabaseUser.user_metadata.name || existing.name,
        avatarUrl: supabaseUser.user_metadata.avatar_url || existing.avatarUrl,
      })
      .where(eq(users.id, existing.id))
    return existing
  }

  // Also check by email for existing users switching providers
  if (supabaseUser.email) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, supabaseUser.email)).limit(1)

    if (byEmail) {
      await db
        .update(users)
        .set({
          provider,
          externalId,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
          avatarUrl: supabaseUser.user_metadata.avatar_url || byEmail.avatarUrl,
        })
        .where(eq(users.id, byEmail.id))
      return byEmail
    }
  }

  const id = nanoid()
  const username =
    supabaseUser.user_metadata.user_name ||
    supabaseUser.user_metadata.preferred_username ||
    supabaseUser.email?.split('@')[0] ||
    `user-${id.slice(0, 6)}`

  const [newUser] = await db
    .insert(users)
    .values({
      id,
      provider,
      externalId,
      accessToken: null,
      username,
      email: supabaseUser.email ?? null,
      name: supabaseUser.user_metadata.full_name || supabaseUser.user_metadata.name || null,
      avatarUrl: supabaseUser.user_metadata.avatar_url || null,
    })
    .returning()

  return newUser
}
