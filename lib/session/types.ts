export type AuthProvider = 'github' | 'vercel' | 'google' | 'email'

export interface SessionUserInfo {
  user: User | undefined
  authProvider?: AuthProvider
  githubConnected?: boolean
}

export interface Tokens {
  accessToken: string
  expiresAt?: number
  refreshToken?: string
}

export interface Session {
  created: number
  authProvider: AuthProvider
  user: User
}

interface User {
  id: string // Internal user ID (from users table)
  username: string
  email: string | undefined
  avatar: string
  name?: string
}
