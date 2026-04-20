import { createHash } from 'crypto'

const RESERVED = new Set([
  'root',
  'admin',
  'daemon',
  'bin',
  'sys',
  'nobody',
  'www-data',
  'mail',
  'news',
  'sshd',
  'systemd',
  'ubuntu',
  'debian',
  'cowork',
])

/**
 * Generate a stable Linux username from a user's email + user ID.
 *
 * Format: `<local>-<hash>` where
 *   - `<local>` is a sanitized 4-16 char prefix of the email local-part
 *   - `<hash>` is a 4-char lowercase-hex digest of the user ID (stability)
 *
 * Guarantees:
 *   - Matches /^[a-z][a-z0-9-]{0,30}$/
 *   - Deterministic across calls (same userId + email -> same username)
 *   - Cannot collide with common system accounts (RESERVED list)
 */
export function generateLinuxUsername(userId: string, email: string | null): string {
  const localPart = (email?.split('@')[0] ?? 'user').toLowerCase()
  let sanitized = localPart.replace(/[^a-z0-9]/g, '')
  if (!sanitized || !/^[a-z]/.test(sanitized)) sanitized = 'u' + sanitized
  sanitized = sanitized.slice(0, 16) || 'user'

  const hash = createHash('sha256').update(userId).digest('hex').slice(0, 4)
  let username = `${sanitized}-${hash}`
  if (username.length > 30) username = username.slice(0, 30)

  if (RESERVED.has(username)) username = `u-${hash}`

  return username
}
