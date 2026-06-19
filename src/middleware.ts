/**
 * Security-headers middleware.
 *
 * Applies a small set of defensive headers to /admin pages and /api/*
 * routes. Kept deliberately narrow so it does not interfere with the
 * public-facing marketing page (/, /votar/[codigo], /apresentacao/
 * [codigo]) — those still need to be embedded/iframe-friendly in some
 * contexts and we don't want to over-restrict them.
 *
 * Headers set:
 *   X-Content-Type-Options: nosniff
 *   X-Frame-Options: DENY
 *   Referrer-Policy: strict-origin-when-cross-origin
 *   Permissions-Policy: geolocation=(), microphone=(), camera=()
 */
import { NextResponse, type NextRequest } from 'next/server'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
}

export function middleware(_request: NextRequest) {
  // Eagerly create the response so headers are set before any other
  // middleware logic runs.
  const response = NextResponse.next()
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(k, v)
  }
  return response
}

export const config = {
  // Only run on /admin and /api/* — leave the public landing/votar/
  // apresentacao routes untouched.
  matcher: ['/admin/:path*', '/api/:path*'],
}
