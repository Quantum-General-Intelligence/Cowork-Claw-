import { AuthForm } from './auth-form'

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

export default async function AuthPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {error && (
          <div className="mb-6 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center">
            Authentication failed. Please try again.
          </div>
        )}
        <AuthForm next={next} />
      </div>
    </div>
  )
}
