import { type NextRequest } from 'next/server'

/**
 * Returns the public-facing origin for the request, respecting
 * reverse-proxy headers (X-Forwarded-Host / X-Forwarded-Proto)
 * set by Traefik / Cloudflare. Falls back to req.nextUrl.origin.
 */
export function getOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()

  if (forwardedHost) {
    const proto = forwardedProto || 'https'
    return `${proto}://${forwardedHost}`
  }

  const host = req.headers.get('host')
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1')) {
    const proto = forwardedProto || req.nextUrl.protocol?.replace(':', '') || 'https'
    return `${proto}://${host}`
  }

  return req.nextUrl.origin
}
