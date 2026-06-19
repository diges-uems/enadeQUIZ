/**
 * Next.js Instrumentation — runs ONCE when the server starts.
 *
 * We use it to ensure the SQLite database file exists before any request
 * is served. This makes the app resilient to production environments
 * where:
 *   - The platform sets DATABASE_URL to a path whose directory doesn't
 *     exist yet, OR
 *   - The platform doesn't ship the DB file (so we seed from a template)
 *
 * See src/lib/db-ensure.ts for the full logic.
 *
 * Note: `register()` can run in both Node.js and Edge runtimes. We guard
 * with NEXT_RUNTIME so the file-system code only runs on Node.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' && process.env.NEXT_RUNTIME !== undefined) {
    // Edge runtime — skip (file system not available)
    return
  }

  try {
    const { ensureDatabase } = await import('./lib/db-ensure')
    await ensureDatabase()
    console.log('[instrumentation] Database ready check complete')
  } catch (err) {
    // Non-fatal — server still starts; /api/health will surface real errors
    console.error('[instrumentation] Database ensure failed (non-fatal):', err)
  }
}
