import { NextResponse } from 'next/server'

/**
 * GET /api/health — Lightweight health check endpoint.
 *
 * Used by the Z.ai platform (or any orchestrator) to verify the server
 * is alive and the database is reachable.
 *
 * Returns:
 *   200 — { ok: true, db: "connected" | "error", ts: ISO string }
 *   503 — { ok: false, db: "error", error: string }
 *
 * This route is PUBLIC (no auth) and does NOT count toward rate limits.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    // Lazy-import db so that if Prisma fails to load, we still return
    // a response (with db: "error") instead of crashing.
    const { db } = await import('@/lib/db')

    // Run a trivial query to confirm the DB is reachable.
    await db.$queryRaw`SELECT 1`

    return NextResponse.json({
      ok: true,
      db: 'connected',
      ts: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        ts: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
