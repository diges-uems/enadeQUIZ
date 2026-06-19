import fs from 'node:fs'
import path from 'node:path'

/**
 * Ensures the SQLite database file exists and has a schema.
 *
 * This runs at server startup (via src/instrumentation.ts) and handles
 * three production scenarios that would otherwise crash the app:
 *
 * 1. DATABASE_URL points to a file in a directory that doesn't exist yet
 *    (e.g. file:/app/db/custom.db but /app/db/ wasn't created by the
 *    platform). → We mkdir -p the directory.
 *
 * 2. DATABASE_URL points to a non-existent file (e.g. platform set the
 *    env var but didn't ship the DB). → We copy a template DB file
 *    (db/custom.db, shipped in the standalone bundle) to the target
 *    location so the schema is present.
 *
 * 3. DATABASE_URL is not set at all. → We log a warning and return;
 *    API routes will surface a clear 503 via the /api/health endpoint.
 *
 * This function NEVER throws — it logs and returns so the server can
 * still start. Routes that need the DB will surface any remaining
 * errors via the health check.
 */
export async function ensureDatabase(): Promise<void> {
  // FALLBACK: If DATABASE_URL is not set (e.g. .env is gitignored and the
  // platform doesn't inject it), default to the shipped DB file.
  // `db/custom.db` is committed to the repo with tables + seed data.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:db/custom.db'
    console.log('[db-ensure] DATABASE_URL not set — defaulting to file:db/custom.db')
  }

  const url = process.env.DATABASE_URL

  // Only handle SQLite file: URLs (we don't use postgres/mysql)
  const match = url.match(/^file:(.+)$/)
  if (!match) {
    console.log('[db-ensure] DATABASE_URL is not a file: URL, skipping file checks:', url)
    return
  }

  const rawPath = match[1]
  // Resolve relative to CWD (Prisma resolves relative paths the same way)
  const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)
  const dbDir = path.dirname(dbPath)

  try {
    // 0. CRITICAL: Rewrite DATABASE_URL to an ABSOLUTE path.
    // Prisma resolves relative `file:` URLs ambiguously (relative to the
    // schema dir at build time, not CWD at runtime). This causes
    // "Unable to open database file" errors even when the file exists.
    // By canonicalizing to an absolute path here — BEFORE any Prisma
    // query runs — we guarantee Prisma finds the file.
    if (process.env.DATABASE_URL !== `file:${dbPath}`) {
      process.env.DATABASE_URL = `file:${dbPath}`
      console.log('[db-ensure] Rewrote DATABASE_URL to absolute path:', `file:${dbPath}`)
    }

    // 1. Ensure the parent directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
      console.log('[db-ensure] Created database directory:', dbDir)
    }

    // 2. If the DB file doesn't exist or is empty, seed it from the template
    const exists = fs.existsSync(dbPath)
    const isEmpty = exists && fs.statSync(dbPath).size === 0

    if (!exists || isEmpty) {
      // Template ships at <cwd>/db/custom.db in the standalone bundle
      const candidates = [
        path.join(process.cwd(), 'db', 'custom.db'),
        path.join(__dirname, '..', '..', 'db', 'custom.db'),
        path.join(process.cwd(), '.next', 'standalone', 'db', 'custom.db'),
      ]

      let templatePath: string | null = null
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
          templatePath = candidate
          break
        }
      }

      if (templatePath) {
        fs.copyFileSync(templatePath, dbPath)
        console.log('[db-ensure] Seeded database from template:', templatePath, '→', dbPath)
      } else {
        console.warn(
          '[db-ensure] No template DB found. Prisma will create an empty file but tables will be missing.',
          'Looked in:', candidates
        )
      }
    } else {
      console.log('[db-ensure] Database exists:', dbPath, `(${fs.statSync(dbPath).size} bytes)`)
    }
  } catch (err) {
    // NEVER throw — let the server start so /api/health can report the error
    console.error('[db-ensure] Failed to ensure database (non-fatal):', err)
  }
}
