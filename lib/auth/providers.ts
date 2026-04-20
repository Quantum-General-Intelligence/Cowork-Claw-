/**
 * Returns which Supabase auth providers are enabled for the `/auth` sign-in UI.
 *
 * Controlled by `NEXT_PUBLIC_AUTH_PROVIDERS`, a comma-separated list of
 * providers. Unknown values are ignored. Defaults to `email,google,github`.
 */
export function getEnabledAuthProviders(): {
  email: boolean
  google: boolean
  github: boolean
} {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS || 'email,google,github'
  const enabled = new Set(raw.split(',').map((p) => p.trim().toLowerCase()))

  return {
    email: enabled.has('email'),
    google: enabled.has('google'),
    github: enabled.has('github'),
  }
}
