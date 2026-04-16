const SUPER_ADMIN_EMAILS = ['sam@sammane.com', 'sam@qgi.dev']

// Auto-activate: any @qgi.dev email gets treated as internal team
export function isInternalTeam(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@qgi.dev')
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}
