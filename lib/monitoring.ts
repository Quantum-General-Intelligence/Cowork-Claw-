/**
 * Structured error logging with context.
 * Wraps console.error with additional metadata for debugging.
 */
export function logError(context: string, error: unknown, metadata?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined

  console.error(
    JSON.stringify({
      level: 'error',
      context,
      message: errorMessage,
      stack: errorStack,
      ...metadata,
      timestamp: new Date().toISOString(),
    }),
  )
}

export function logWarn(context: string, message: string, metadata?: Record<string, unknown>) {
  console.warn(
    JSON.stringify({
      level: 'warn',
      context,
      message,
      ...metadata,
      timestamp: new Date().toISOString(),
    }),
  )
}

export function logInfo(context: string, message: string, metadata?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level: 'info',
      context,
      message,
      ...metadata,
      timestamp: new Date().toISOString(),
    }),
  )
}
