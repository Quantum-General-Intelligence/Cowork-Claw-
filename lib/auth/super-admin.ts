const SUPER_ADMIN_EMAILS = ['sam@sammane.com']

export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}
