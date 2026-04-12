export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reconcileStaleTasks } = await import('@/lib/tasks/reconcile')
    // Run after a short delay to let the server fully boot
    setTimeout(() => {
      reconcileStaleTasks().catch(() => {})
    }, 5000)
  }
}
